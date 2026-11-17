import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, recordAudit, requireRole, type AuthenticatedRequest } from '../middleware/auth.ts';
import { User } from '../models/index.ts';

const router = Router();

router.use(authenticate);

router.get('/', requireRole('ADMIN', 'MANAGER'), async (_req, res: Response) => {
  try {
    const users = await User.find().select('-passwordHash -resetTokenHash').sort({ createdAt: -1 }).lean();
    res.json(
      users.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        preferredLanguage: u.preferredLanguage,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to list employees' });
  }
});

const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional().default(''),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'MANAGER', 'WORKER', 'SALESPERSON']),
  preferredLanguage: z.enum(['en', 'so']).optional().default('en'),
});

router.post('/', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid employee data', details: parsed.error.flatten() });
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ error: 'An employee with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const created = await User.create({
      name: parsed.data.name.trim(),
      email,
      phone: parsed.data.phone.trim(),
      passwordHash,
      role: parsed.data.role,
      preferredLanguage: parsed.data.preferredLanguage,
      isActive: true,
    });

    await recordAudit({
      user: req.user,
      action: 'EMPLOYEE_CREATED',
      entityType: 'User',
      entityId: String(created._id),
      details: { email: created.email, role: created.role },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: String(created._id),
      name: created.name,
      email: created.email,
      phone: created.phone,
      role: created.role,
      preferredLanguage: created.preferredLanguage,
      isActive: created.isActive,
      createdAt: created.createdAt,
    });
  } catch {
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(40).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'WORKER', 'SALESPERSON']).optional(),
  preferredLanguage: z.enum(['en', 'so']).optional(),
  isActive: z.boolean().optional(),
});

router.patch('/:id', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid update data', details: parsed.error.flatten() });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Prevent admin from deactivating themselves accidentally
    if (String(user._id) === req.user!.id && parsed.data.isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own active administrator account' });
      return;
    }

    if (parsed.data.name) user.name = parsed.data.name.trim();
    if (parsed.data.phone !== undefined) user.phone = parsed.data.phone.trim();
    if (parsed.data.role) user.role = parsed.data.role;
    if (parsed.data.preferredLanguage) user.preferredLanguage = parsed.data.preferredLanguage;
    if (parsed.data.isActive !== undefined) user.isActive = parsed.data.isActive;

    await user.save();

    await recordAudit({
      user: req.user,
      action: 'EMPLOYEE_UPDATED',
      entityType: 'User',
      entityId: String(user._id),
      details: { role: user.role, isActive: user.isActive },
      ipAddress: req.ip,
    });

    res.json({
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    });
  } catch {
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

export default router;
