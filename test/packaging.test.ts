import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { buildCosmeticPackage } from '../src/server/packager/builder.js';
import { computeSha256Buffer } from '../src/server/packager/validator.js';

describe('Packaging & Manifest Generation Tests', () => {
  const sampleModelJson = JSON.stringify({
    format_version: '1.12.0',
    'minecraft:geometry': [{ description: { identifier: 'geometry.test', texture_width: 64, texture_height: 64 } }]
  });
  const sampleAnimJson = JSON.stringify({
    format_version: '1.8.0',
    animations: {
      'animation.test.idle': { loop: true, animation_length: 1.0 }
    }
  });
  const samplePngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

  it('should build a valid static cosmetic package without animation fields', async () => {
    const output = await buildCosmeticPackage({
      id: 'cozmetics:blazing_boots',
      version: '1.0.0',
      slot: 'LEGS',
      transform: { translate_y: 0.1, scale: 1.0, static_lighting: false },
      model: { filename: 'boots.geo.json', buffer: Buffer.from(sampleModelJson, 'utf8') },
      texture: { filename: 'boots.png', buffer: samplePngBuffer }
    });

    assert.ok(output.zipBuffer && output.zipBuffer.length > 0);
    assert.strictEqual(output.hash, computeSha256Buffer(output.zipBuffer));

    // Inspect manifest inside ZIP
    const zip = new AdmZip(output.zipBuffer);
    const manifestEntry = zip.getEntry('manifest.json');
    assert.ok(manifestEntry, 'manifest.json must exist in ZIP');

    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    assert.strictEqual(manifest.id, 'cozmetics:blazing_boots');
    assert.strictEqual(manifest.version, '1.0.0');
    assert.strictEqual(manifest.model, 'boots.geo.json');
    assert.strictEqual(manifest.texture, 'boots.png');
    assert.strictEqual(manifest.slot, 'LEGS');
    assert.strictEqual(manifest.transform.translate_y, 0.1);
    assert.strictEqual(manifest.transform.scale, 1.0);
    assert.strictEqual(manifest.transform.static_lighting, false);
    assert.strictEqual(manifest.animation, undefined, 'Static cosmetics must not contain animation');
    assert.strictEqual(manifest.idle_animation, undefined);

    // Verify all files present in ZIP
    assert.ok(zip.getEntry('boots.geo.json'));
    assert.ok(zip.getEntry('boots.png'));
  });

  it('should build a valid animated cosmetic package with idle animation', async () => {
    const output = await buildCosmeticPackage({
      id: 'cozmetics:blood_wings',
      version: '2.1.0',
      slot: 'BODY',
      transform: { translate_y: 0.0, scale: 1.2, static_lighting: true },
      model: { filename: 'wings.geo.json', buffer: Buffer.from(sampleModelJson, 'utf8') },
      texture: { filename: 'wings.webp', buffer: samplePngBuffer },
      animation: {
        filename: 'wings.animation.json',
        buffer: Buffer.from(sampleAnimJson, 'utf8'),
        idleAnimation: 'animation.test.idle'
      }
    });

    assert.ok(output.zipBuffer.length > 0);
    const zip = new AdmZip(output.zipBuffer);
    const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf8'));

    assert.strictEqual(manifest.id, 'cozmetics:blood_wings');
    assert.strictEqual(manifest.version, '2.1.0');
    assert.strictEqual(manifest.model, 'wings.geo.json');
    assert.strictEqual(manifest.texture, 'wings.webp');
    assert.strictEqual(manifest.slot, 'BODY');
    assert.strictEqual(manifest.animation, 'wings.animation.json');
    assert.strictEqual(manifest.idle_animation, 'animation.test.idle');
    assert.strictEqual(manifest.transform.static_lighting, true);

    assert.ok(zip.getEntry('wings.animation.json'));
  });

  it('should build deterministic packages (identical inputs yield identical SHA-256 hash)', async () => {
    const input = {
      id: 'cozmetics:deterministic_item',
      version: '1.0.0',
      slot: 'HEAD',
      model: { filename: 'hat.geo.json', buffer: Buffer.from(sampleModelJson, 'utf8') },
      texture: { filename: 'hat.png', buffer: samplePngBuffer }
    };

    const out1 = await buildCosmeticPackage(input);
    const out2 = await buildCosmeticPackage(input);

    assert.strictEqual(out1.hash, out2.hash, 'Deterministic builds must produce identical SHA-256 hashes');
    assert.strictEqual(out1.zipBuffer.length, out2.zipBuffer.length);
  });
});

