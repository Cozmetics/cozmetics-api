import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function initDatabase(dbPath: string): DatabaseSync {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Enable WAL mode for high performance & concurrency
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cosmetics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      slot TEXT NOT NULL,
      version TEXT NOT NULL,
      hash TEXT NOT NULL,
      package_filename TEXT NOT NULL,
      thumbnail_filename TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT 'Cozmetics Official',
      is_animated INTEGER NOT NULL DEFAULT 0,
      model_filename TEXT NOT NULL,
      texture_filename TEXT NOT NULL,
      animation_filename TEXT,
      idle_animation TEXT,
      translate_y REAL NOT NULL DEFAULT 0.0,
      scale REAL NOT NULL DEFAULT 1.0,
      static_lighting INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalogue_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Initialize catalogue revision counter if not present
  const checkStmt = db.prepare("SELECT value FROM catalogue_meta WHERE key = 'revision'");
  const row = checkStmt.get() as { value: string } | undefined;
  if (!row) {
    db.prepare("INSERT INTO catalogue_meta (key, value) VALUES ('revision', '1')").run();
  }

  return db;
}

