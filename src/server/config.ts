import path from 'node:path';
import crypto from 'node:crypto';

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  packagesDir: string;
  thumbnailsDir: string;
  tempDir: string;
  dbPath: string;
  sessionSecret: string;
  baseUrl: string;
  isProduction: boolean;
}

export const DEFAULT_PRODUCTION_DOMAIN = 'https://catalog.cozmetics.arcn.online';

export function loadConfig(): AppConfig {
  const port = parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '0.0.0.0';
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  const packagesDir = path.join(dataDir, 'packages');
  const thumbnailsDir = path.join(dataDir, 'thumbnails');
  const tempDir = path.join(dataDir, 'temp');
  const dbPath = path.join(dataDir, 'metadata.db');
  const sessionSecret = process.env.SESSION_SECRET || 'cozmetics-secret-key-change-in-prod-' + crypto.randomBytes(16).toString('hex');
  const baseUrl = (process.env.BASE_URL || DEFAULT_PRODUCTION_DOMAIN).replace(/\/+$/, '');
  const isProduction = process.env.NODE_ENV === 'production' || baseUrl.includes('cozmetics.arcn.online');

  return {
    port,
    host,
    dataDir,
    packagesDir,
    thumbnailsDir,
    tempDir,
    dbPath,
    sessionSecret,
    baseUrl,
    isProduction
  };
}

