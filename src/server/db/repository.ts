import { DatabaseSync } from 'node:sqlite';

export interface CosmeticRecord {
  id: string;
  name: string;
  category: string;
  slot: string;
  version: string;
  hash: string;
  package_filename: string;
  thumbnail_filename: string;
  description: string;
  author: string;
  is_animated: number;
  model_filename: string;
  texture_filename: string;
  animation_filename: string | null;
  idle_animation: string | null;
  translate_y: number;
  scale: number;
  static_lighting: number;
  status: 'published' | 'draft' | 'unpublished';
  created_at: number;
  updated_at: number;
}

export interface AdminRecord {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  created_at: number;
}

export interface SessionRecord {
  token: string;
  admin_id: string;
  expires_at: number;
  created_at: number;
}

export class Repository {
  constructor(private db: DatabaseSync) {}

  // Revision handling
  getRevision(): number {
    const row = this.db.prepare("SELECT value FROM catalogue_meta WHERE key = 'revision'").get() as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 1;
  }

  bumpRevision(): number {
    const next = this.getRevision() + 1;
    this.db.prepare("INSERT OR REPLACE INTO catalogue_meta (key, value) VALUES ('revision', ?)").run(next.toString());
    return next;
  }

  // Cosmetics
  getPublishedCosmetics(): CosmeticRecord[] {
    const stmt = this.db.prepare("SELECT * FROM cosmetics WHERE status = 'published' ORDER BY created_at DESC");
    return stmt.all() as unknown as CosmeticRecord[];
  }

  getAllCosmetics(): CosmeticRecord[] {
    const stmt = this.db.prepare("SELECT * FROM cosmetics ORDER BY created_at DESC");
    return stmt.all() as unknown as CosmeticRecord[];
  }

  getCosmeticById(id: string): CosmeticRecord | null {
    const stmt = this.db.prepare("SELECT * FROM cosmetics WHERE id = ?");
    const row = stmt.get(id);
    return row ? (row as unknown as CosmeticRecord) : null;
  }

  saveCosmetic(item: CosmeticRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cosmetics (
        id, name, category, slot, version, hash, package_filename, thumbnail_filename,
        description, author, is_animated, model_filename, texture_filename,
        animation_filename, idle_animation, translate_y, scale, static_lighting,
        status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    stmt.run(
      item.id, item.name, item.category, item.slot, item.version, item.hash, item.package_filename, item.thumbnail_filename,
      item.description, item.author, item.is_animated, item.model_filename, item.texture_filename,
      item.animation_filename, item.idle_animation, item.translate_y, item.scale, item.static_lighting,
      item.status, item.created_at, item.updated_at
    );

    this.bumpRevision();
  }

  updateCosmeticStatus(id: string, status: 'published' | 'draft' | 'unpublished'): boolean {
    const stmt = this.db.prepare("UPDATE cosmetics SET status = ?, updated_at = ? WHERE id = ?");
    const result = stmt.run(status, Date.now(), id);
    if (result.changes > 0) {
      this.bumpRevision();
      return true;
    }
    return false;
  }

  deleteCosmetic(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM cosmetics WHERE id = ?");
    const result = stmt.run(id);
    if (result.changes > 0) {
      this.bumpRevision();
      return true;
    }
    return false;
  }

  // Admins
  createAdmin(id: string, username: string, passwordHash: string, salt: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO admins (id, username, password_hash, salt, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, username, passwordHash, salt, Date.now());
  }

  getAdminByUsername(username: string): AdminRecord | null {
    const stmt = this.db.prepare("SELECT * FROM admins WHERE username = ?");
    const row = stmt.get(username);
    return row ? (row as unknown as AdminRecord) : null;
  }

  getAdminById(id: string): AdminRecord | null {
    const stmt = this.db.prepare("SELECT * FROM admins WHERE id = ?");
    const row = stmt.get(id);
    return row ? (row as unknown as AdminRecord) : null;
  }

  countAdmins(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM admins").get() as { cnt: number | bigint };
    return Number(row.cnt);
  }

  // Sessions
  createSession(token: string, adminId: string, expiresAt: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (token, admin_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(token, adminId, expiresAt, Date.now());
  }

  getSession(token: string): (SessionRecord & { username: string }) | null {
    const stmt = this.db.prepare(`
      SELECT s.token, s.admin_id, s.expires_at, s.created_at, a.username
      FROM sessions s
      JOIN admins a ON s.admin_id = a.id
      WHERE s.token = ? AND s.expires_at > ?
    `);
    const row = stmt.get(token, Date.now());
    return row ? (row as unknown as SessionRecord & { username: string }) : null;
  }

  deleteSession(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  pruneExpiredSessions(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  }
}

