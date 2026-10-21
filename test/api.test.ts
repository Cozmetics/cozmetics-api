import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { createServer } from '../src/server/server.js';
import { AppConfig } from '../src/server/config.js';
import { Repository } from '../src/server/db/repository.js';
import { hashPassword } from '../src/server/auth/auth.js';

describe('API Endpoints & Storage Persistence Tests', () => {
  let tmpDir: string;
  let config: AppConfig;
  let app: FastifyInstance;
  let repo: Repository;
  let adminCookie: string;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozmetics-api-test-'));
    config = {
      port: 3099,
      host: '127.0.0.1',
      dataDir: tmpDir,
      packagesDir: path.join(tmpDir, 'packages'),
      thumbnailsDir: path.join(tmpDir, 'thumbnails'),
      tempDir: path.join(tmpDir, 'temp'),
      dbPath: path.join(tmpDir, 'metadata.db'),
      sessionSecret: 'test-secret-key-12345678901234567890',
      baseUrl: 'http://localhost:3099',
      isProduction: false
    };

    fs.mkdirSync(config.packagesDir, { recursive: true });
    fs.mkdirSync(config.thumbnailsDir, { recursive: true });
    fs.mkdirSync(config.tempDir, { recursive: true });

    const serverObj = await createServer(config);
    app = serverObj.app;
    repo = serverObj.repo;

    // Seed test admin
    const { hash, salt } = hashPassword('AdminPass123!');
    repo.createAdmin(crypto.randomUUID(), 'testadmin', hash, salt);
  });

  after(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/health should report healthy service status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health'
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.service, 'Cozmetics Publishing Service');
    assert.strictEqual(typeof body.revision, 'number');
  });

  it('POST /api/admin/login should authenticate valid admin and set session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { username: 'testadmin', password: 'AdminPass123!' }
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.username, 'testadmin');
    assert.ok(body.token);

    // Save cookie
    const cookieHeader = res.headers['set-cookie'];
    assert.ok(cookieHeader);
    adminCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader as string);
  });

  it('GET /api/admin/me should return authenticated admin profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: adminCookie }
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.authenticated, true);
    assert.strictEqual(body.admin.username, 'testadmin');
  });

  it('GET /api/catalog should support ETag caching and revision updates', async () => {
    // 1. First fetch
    const res1 = await app.inject({
      method: 'GET',
      url: '/api/catalog'
    });
    assert.strictEqual(res1.statusCode, 200);
    const etag = res1.headers['etag'] as string;
    assert.ok(etag);

    // 2. Fetch with If-None-Match should return 304 Not Modified
    const res2 = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { 'if-none-match': etag }
    });
    assert.strictEqual(res2.statusCode, 304);

    // 3. Mod compatibility alias route /mod/catalogue
    const res3 = await app.inject({
      method: 'GET',
      url: '/mod/catalogue'
    });
    assert.strictEqual(res3.statusCode, 200);
  });

  it('should persist catalogue and cosmetics across service reboot', async () => {
    // Save sample cosmetic in repo
    const item = {
      id: 'cozmetics:reboot_test',
      name: 'Reboot Test',
      category: 'WINGS',
      slot: 'BODY',
      version: '1.0.0',
      hash: 'abc123456789',
      package_filename: 'reboot_test-1.0.0.zip',
      thumbnail_filename: 'reboot_test.png',
      description: 'Persistent item across reboot',
      author: 'Tester',
      is_animated: 0,
      model_filename: 'model.geo.json',
      texture_filename: 'texture.png',
      animation_filename: null,
      idle_animation: null,
      translate_y: 0.0,
      scale: 1.0,
      static_lighting: 0,
      status: 'published' as const,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    repo.saveCosmetic(item);

    // Close server
    await app.close();

    // Re-initialize server on identical dbPath
    const restarted = await createServer(config);
    try {
      const persisted = restarted.repo.getCosmeticById('cozmetics:reboot_test');
      assert.ok(persisted, 'Item must persist across server reboot');
      assert.strictEqual(persisted.name, 'Reboot Test');
      assert.strictEqual(persisted.status, 'published');

      // Check /api/catalog on restarted server
      const catRes = await restarted.app.inject({
        method: 'GET',
        url: '/api/catalog'
      });
      assert.strictEqual(catRes.statusCode, 200);
      const catJson = JSON.parse(catRes.payload);
      assert.ok(catJson.cosmetics.some((c: any) => c.id === 'cozmetics:reboot_test'));
    } finally {
      await restarted.app.close();
    }
  });
});

