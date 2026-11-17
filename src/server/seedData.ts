import bcrypt from 'bcryptjs';
import { config } from './config.ts';
import { CompanySettings, Product, User } from './models/index.ts';

export async function ensureInitialBootstrap(): Promise<void> {
  // Ensure default CompanySettings exist
  const existingSettings = await CompanySettings.findOne({ key: 'default' });
  if (!existingSettings) {
    await CompanySettings.create({
      key: 'default',
      companyName: 'BULUKEETI PRO Concrete Works',
      companyAddress: 'Mogadishu Industrial Zone',
      phoneNumber: '+252 61 000 0000',
      currency: 'USD',
      defaultLanguage: 'en',
      lowStockAlertDefault: 500,
      invoiceFooterNote: 'Thank you for choosing BULUKEETI PRO.',
    });
  }

  // Ensure default block sizes exist (4 inch, 6 inch, 8 inch)
  const productCount = await Product.countDocuments();
  if (productCount === 0) {
    await Product.insertMany([
      {
        name: '4 inch',
        code: 'BLK-4',
        dimensions: '400 × 200 × 100 mm',
        unitPrice: 0.45,
        openingStock: 0,
        availableStock: 0,
        curingStock: 0,
        damagedStock: 0,
        lowStockThreshold: 500,
        isActive: true,
      },
      {
        name: '6 inch',
        code: 'BLK-6',
        dimensions: '400 × 200 × 150 mm',
        unitPrice: 0.65,
        openingStock: 0,
        availableStock: 0,
        curingStock: 0,
        damagedStock: 0,
        lowStockThreshold: 500,
        isActive: true,
      },
      {
        name: '8 inch',
        code: 'BLK-8',
        dimensions: '400 × 200 × 200 mm',
        unitPrice: 0.85,
        openingStock: 0,
        availableStock: 0,
        curingStock: 0,
        damagedStock: 0,
        lowStockThreshold: 500,
        isActive: true,
      },
    ]);
  }

  // Ensure initial Admin account exists when database has no users
  const userCount = await User.countDocuments();
  if (userCount === 0) {
    const passwordHash = await bcrypt.hash(config.seedAdminPassword, 12);
    await User.create({
      name: config.seedAdminName,
      email: config.seedAdminEmail,
      phone: '+252 61 000 0000',
      passwordHash,
      role: 'ADMIN',
      preferredLanguage: 'en',
      isActive: true,
    });
    console.log(`[Seed] Created initial ADMIN user (${config.seedAdminEmail})`);
  }
}
