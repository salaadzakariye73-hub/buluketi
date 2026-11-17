import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  mongodbUri: (process.env.MONGODB_URI || '').trim(),
  jwtSecret:
    process.env.JWT_SECRET && process.env.JWT_SECRET !== 'change-this-to-a-long-random-secret-key-in-production'
      ? process.env.JWT_SECRET
      : 'bulukeeti-pro-dev-secret-change-in-production-9f4a8e2c',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: (process.env.CORS_ORIGIN || '').trim(),
  seedAdminName: process.env.SEED_ADMIN_NAME || 'Admin Manager',
  seedAdminEmail: (process.env.SEED_ADMIN_EMAIL || 'admin@bulukeeti.com').toLowerCase(),
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234',
};
