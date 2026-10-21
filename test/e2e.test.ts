import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { FastifyInstance } from 'fastify';
import { createServer } from '../src/server/server.js';
import { AppConfig } from '../src/server/config.js';
import { hashPassword } from '../src/server/auth/auth.js';
import { computeSha256Buffer } from '../src/server/packager/validator.js';

describe('End-to-End Publishing Pipeline Test', () => {
  let tmpDir: string;
  let config: AppConfig;
  let app: FastifyInstance;
  let adminCookie: string;

  const sampleModel = JSON.stringify({
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: { identifier: 'geometry.demon2024BloodDragonWings', texture_width: 128, texture_height: 128 },
        bones: [{ name: 'anchor_body', pivot: [0, 24, 0] }]
      }
    ]
  });

  const sampleAnim = JSON.stringify({
    format_version: '1.8.0',
    animations: {
      'animation.demon2024BloodDragonWings.idle': {
        loop: true,
        animation_length: 2.2,
        bones: { wing1: { rotation: { '0.0': { vector: [0, 0, 0] } } } }
      }
    }
  });

  // 1x1 WebP buffer
  const sampleWebpBuffer = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozmetics-e2e-'));
    config = {
      port: 3098,
      host: '127.0.0.1',
      dataDir: tmpDir,
      packagesDir: path.join(tmpDir, 'packages'),
      thumbnailsDir: path.join(tmpDir, 'thumbnails'),
      tempDir: path.join(tmpDir, 'temp'),
      dbPath: path.join(tmpDir, 'metadata.db'),
      sessionSecret: 'e2e-secret-key-12345678901234567890',
      baseUrl: 'http://localhost:3098',
      isProduction: false
    };

    fs.mkdirSync(config.packagesDir, { recursive: true });
    fs.mkdirSync(config.thumbnailsDir, { recursive: true });
    fs.mkdirSync(config.tempDir, { recursive: true });

    const serverObj = await createServer(config);
    app = serverObj.app;

    // Create admin
    const { hash, salt } = hashPassword('AdminPass123!');
    serverObj.repo.createAdmin(crypto.randomUUID(), 'publisher', hash, salt);

    // Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { username: 'publisher', password: 'AdminPass123!' }
    });
    assert.strictEqual(loginRes.statusCode, 200);
    const cookieHeader = loginRes.headers['set-cookie'];
    adminCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader as string);
  });

  after(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full publishing workflow: upload -> inspect -> validate -> build -> publish -> download -> verify', async () => {
    // 1. Prepare temporary upload files
    const uploadId = crypto.randomUUID();
    const sessionDir = path.join(config.tempDir, uploadId);
    fs.mkdirSync(sessionDir, { recursive: true });

    fs.writeFileSync(path.join(sessionDir, 'demon2024BloodDragonWings.geo.json'), sampleModel);
    fs.writeFileSync(path.join(sessionDir, 'demon2024BloodDragonWings.animation.json'), sampleAnim);
    fs.writeFileSync(path.join(sessionDir, 'demon2024BloodDragonWings.webp'), sampleWebpBuffer);
    fs.writeFileSync(path.join(sessionDir, 'thumbnail.webp'), sampleWebpBuffer);

    // 2. Inspect assets
    const inspectRes = await app.inject({
      method: 'POST',
      url: '/api/admin/inspect',
      headers: { cookie: adminCookie },
      payload: { uploadId }
    });
    assert.strictEqual(inspectRes.statusCode, 200);
    const inspection = JSON.parse(inspectRes.payload);
    assert.strictEqual(inspection.isAnimated, true);
    assert.ok(inspection.discoveredAnimations.includes('animation.demon2024BloodDragonWings.idle'));
    assert.strictEqual(inspection.suggestedCategory, 'WINGS');
    assert.strictEqual(inspection.suggestedSlot, 'BODY');

    // 3. Validate draft configuration
    const validateRes = await app.inject({
      method: 'POST',
      url: '/api/admin/validate',
      headers: { cookie: adminCookie },
      payload: {
        uploadId,
        id: 'cozmetics:blood_dragon_wings',
        name: 'Blood Dragon Wings',
        category: 'WINGS',
        slot: 'BODY',
        version: '1.0.0',
        modelFile: 'demon2024BloodDragonWings.geo.json',
        textureFile: 'demon2024BloodDragonWings.webp',
        thumbnailFile: 'thumbnail.webp',
        isAnimated: true,
        animationFile: 'demon2024BloodDragonWings.animation.json',
        idleAnimation: 'animation.demon2024BloodDragonWings.idle',
        transform: { translate_y: 0.0, scale: 1.0, static_lighting: false }
      }
    });
    assert.strictEqual(validateRes.statusCode, 200);
    const validation = JSON.parse(validateRes.payload);
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.manifestPreview.id, 'cozmetics:blood_dragon_wings');

    // 4. Build and publish package
    const buildRes = await app.inject({
      method: 'POST',
      url: '/api/admin/packages',
      headers: { cookie: adminCookie },
      payload: {
        uploadId,
        id: 'cozmetics:blood_dragon_wings',
        name: 'Blood Dragon Wings',
        category: 'WINGS',
        slot: 'BODY',
        version: '1.0.0',
        description: 'Immense leather-spanned draconic wings with burning demonic membranes.',
        author: 'Cozmetics Official',
        modelFile: 'demon2024BloodDragonWings.geo.json',
        textureFile: 'demon2024BloodDragonWings.webp',
        thumbnailFile: 'thumbnail.webp',
        isAnimated: true,
        animationFile: 'demon2024BloodDragonWings.animation.json',
        idleAnimation: 'animation.demon2024BloodDragonWings.idle',
        transform: { translate_y: 0.0, scale: 1.0, static_lighting: false },
        publishImmediately: true
      }
    });
    assert.strictEqual(buildRes.statusCode, 200);
    const buildJson = JSON.parse(buildRes.payload);
    assert.strictEqual(buildJson.success, true);
    assert.strictEqual(buildJson.status, 'published');
    const publishedHash = buildJson.hash;
    assert.ok(publishedHash);

    // 5. Query public catalogue endpoint
    const catRes = await app.inject({
      method: 'GET',
      url: '/api/catalog'
    });
    assert.strictEqual(catRes.statusCode, 200);
    const catJson = JSON.parse(catRes.payload);
    const foundItem = catJson.cosmetics.find((c: any) => c.id === 'cozmetics:blood_dragon_wings');
    assert.ok(foundItem, 'Published cosmetic must appear in public catalogue');
    assert.strictEqual(foundItem.name, 'Blood Dragon Wings');
    assert.strictEqual(foundItem.category, 'WINGS');
    assert.strictEqual(foundItem.slot, 'BODY');
    assert.strictEqual(foundItem.hash, publishedHash);

    // 6. Download ZIP package from generated download route
    const downloadRes = await app.inject({
      method: 'GET',
      url: '/api/packages/cozmetics:blood_dragon_wings/1.0.0'
    });
    assert.strictEqual(downloadRes.statusCode, 200);
    assert.strictEqual(downloadRes.headers['content-type'], 'application/zip');
    assert.strictEqual(downloadRes.headers['x-package-sha256'], publishedHash);

    const zipBuffer = downloadRes.rawPayload;
    assert.strictEqual(computeSha256Buffer(zipBuffer), publishedHash, 'Downloaded ZIP hash must match catalogue hash');

    // 7. Verify internal contents of downloaded ZIP
    const zip = new AdmZip(zipBuffer);
    const manifestEntry = zip.getEntry('manifest.json');
    assert.ok(manifestEntry, 'ZIP must contain manifest.json');

    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    assert.deepStrictEqual(manifest, {
      id: 'cozmetics:blood_dragon_wings',
      version: '1.0.0',
      model: 'demon2024BloodDragonWings.geo.json',
      texture: 'demon2024BloodDragonWings.webp',
      slot: 'BODY',
      transform: {
        translate_y: 0.0,
        scale: 1.0,
        static_lighting: false
      },
      animation: 'demon2024BloodDragonWings.animation.json',
      idle_animation: 'animation.demon2024BloodDragonWings.idle'
    });

    assert.ok(zip.getEntry('demon2024BloodDragonWings.geo.json'));
    assert.ok(zip.getEntry('demon2024BloodDragonWings.webp'));
    assert.ok(zip.getEntry('demon2024BloodDragonWings.animation.json'));

    // 8. Test unpublishing
    const unpubRes = await app.inject({
      method: 'POST',
      url: '/api/admin/packages/cozmetics:blood_dragon_wings/unpublish',
      headers: { cookie: adminCookie }
    });
    assert.strictEqual(unpubRes.statusCode, 200);

    // Catalogue should now be empty of published items
    const catAfterUnpub = await app.inject({ method: 'GET', url: '/api/catalog' });
    const catAfterJson = JSON.parse(catAfterUnpub.payload);
    assert.ok(!catAfterJson.cosmetics.some((c: any) => c.id === 'cozmetics:blood_dragon_wings'));
  });
});

