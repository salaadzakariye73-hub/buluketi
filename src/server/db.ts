import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from './config.ts';

let memoryServer: MongoMemoryServer | null = null;
let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  mongoose.set('strictQuery', true);

  if (config.mongodbUri) {
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 10000,
    });
    isConnected = true;
    console.log('[DB] Connected to MongoDB Atlas');
    return;
  }

  // Fallback to embedded MongoDB when MONGODB_URI is not configured
  const dataDir = path.resolve(process.cwd(), '.data', 'mongodb');
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    memoryServer = await MongoMemoryServer.create({
      instance: {
        dbPath: dataDir,
        storageEngine: 'wiredTiger',
      },
    });
  } catch {
    // Fallback to pure in-memory if wiredTiger lock/fs fails
    memoryServer = await MongoMemoryServer.create();
  }

  const uri = memoryServer.getUri();
  await mongoose.connect(uri);
  isConnected = true;
  console.log('[DB] Connected to embedded MongoDB instance');
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
  isConnected = false;
}
