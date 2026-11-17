import { connectDB, disconnectDB } from './db.ts';
import { ensureInitialBootstrap } from './seedData.ts';

async function runSeed() {
  try {
    await connectDB();
    await ensureInitialBootstrap();
    console.log('[Seed] Database initialization complete.');
  } catch (err) {
    console.error('[Seed] Failed:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

runSeed();
