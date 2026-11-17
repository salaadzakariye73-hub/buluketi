import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';
import { AuditLog, User, type UserRole } from '../models/index.ts';

export interface AuthUserPayload {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  preferredLanguage: 'en' | 'so';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

export function signToken(user: AuthUserPayload): string {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  );
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
      return;
    }

    const token = authHeader.slice(7).trim();
    const decoded = jwt.verify(token, config.jwtSecret) as { sub?: string };
    if (!decoded?.sub) {
      res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
      return;
    }

    const dbUser = await User.findById(decoded.sub).select('-passwordHash -resetTokenHash').lean();
    if (!dbUser || !dbUser.isActive) {
      res.status(401).json({ error: 'Account inactive or not found', code: 'ACCOUNT_INACTIVE' });
      return;
    }

    req.user = {
      id: String(dbUser._id),
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      preferredLanguage: dbUser.preferredLanguage,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid token', code: 'SESSION_EXPIRED' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

// Recursively strip MongoDB operator keys ($ and .) to prevent NoSQL injection
function cleanObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cleanObject);
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('$') || k.includes('.')) {
        continue;
      }
      cleaned[k] = cleanObject(v);
    }
    return cleaned;
  }
  return value;
}

export function sanitizeNoSql(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = cleanObject(req.body);
  }
  next();
}

export async function recordAudit(params: {
  user?: AuthUserPayload;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    await AuditLog.create({
      userId: params.user?.id,
      userName: params.user?.name || 'System',
      userRole: params.user?.role || 'SYSTEM',
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details,
      ipAddress: params.ipAddress || '',
    });
  } catch (err) {
    console.error('[AuditLog] Failed to record audit entry:', err);
  }
}
