import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, recordAudit, requireRole, signToken, type AuthenticatedRequest } from '../middleware/auth.ts';
import { User } from '../models/index.ts';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post('/login', async (req, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and password (min 6 chars) are required', code: 'VALIDATION_ERROR' });
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();
    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid credentials or account inactive', code: 'INVALID_CREDENTIALS' });
      return;
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      await recordAudit({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: String(user._id),
        details: { email },
        ipAddress: req.ip,
      });
      res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      return;
    }

    user.lastLoginAt = new Date();
    await user.save();

    const payload = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
    };

    const token = signToken(payload);

    await recordAudit({
      user: payload,
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: String(user._id),
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        ...payload,
        phone: user.phone,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).select('-passwordHash -resetTokenHash').lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
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
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

const profileUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(40).optional(),
  preferredLanguage: z.enum(['en', 'so']).optional(),
  currentPassword: z.string().min(6).optional(),
  newPassword: z.string().min(8).optional(),
});

router.patch('/profile', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid profile update payload', details: parsed.error.flatten() });
      return;
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (parsed.data.name) user.name = parsed.data.name.trim();
    if (parsed.data.phone !== undefined) user.phone = parsed.data.phone.trim();
    if (parsed.data.preferredLanguage) user.preferredLanguage = parsed.data.preferredLanguage;

    if (parsed.data.newPassword) {
      if (!parsed.data.currentPassword) {
        res.status(400).json({ error: 'Current password is required to set a new password' });
        return;
      }
      const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
      if (!matches) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }
      user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    }

    await user.save();

    await recordAudit({
      user: req.user,
      action: 'PROFILE_UPDATED',
      entityType: 'User',
      entityId: String(user._id),
      details: {
        preferredLanguage: user.preferredLanguage,
        passwordChanged: Boolean(parsed.data.newPassword),
      },
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
    });
  } catch {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Request password reset token (generates one-time token; in production integrates with SMTP/SMS)
router.post('/request-reset', async (req, res: Response) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }

    const user = await User.findOne({ email: parsed.data.email.toLowerCase().trim(), isActive: true });
    if (!user) {
      // Do not leak user existence
      res.json({ message: 'If an active account exists, password reset instructions have been prepared. Contact your Administrator if needed.' });
      return;
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetTokenHash = tokenHash;
    user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    await recordAudit({
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: String(user._id),
      ipAddress: req.ip,
    });

    res.json({
      message: 'Password reset token generated. Ask your Administrator to confirm or enter your reset token.',
    });
  } catch {
    res.status(500).json({ error: 'Failed to process reset request' });
  }
});

// Complete password reset using token
router.post('/reset-password', async (req, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      token: z.string().min(10),
      newPassword: z.string().min(8),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email, reset token, and new password (min 8 chars) are required' });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(parsed.data.token.trim()).digest('hex');
    const user = await User.findOne({
      email: parsed.data.email.toLowerCase().trim(),
      resetTokenHash: tokenHash,
      resetTokenExpires: { $gt: new Date() },
      isActive: true,
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    await recordAudit({
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: String(user._id),
      ipAddress: req.ip,
    });

    res.json({ message: 'Password updated successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Admin-assisted secure password reset for an employee
router.post('/admin-reset-password', authenticate, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schema = z.object({
      userId: z.string().min(1),
      newPassword: z.string().min(8),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'User ID and new password (min 8 chars) are required' });
      return;
    }

    const target = await User.findById(parsed.data.userId);
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    target.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    target.resetTokenHash = undefined;
    target.resetTokenExpires = undefined;
    await target.save();

    await recordAudit({
      user: req.user,
      action: 'ADMIN_PASSWORD_RESET',
      entityType: 'User',
      entityId: String(target._id),
      details: { targetEmail: target.email },
      ipAddress: req.ip,
    });

    res.json({ message: 'Employee password reset successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to reset employee password' });
  }
});

export default router;
