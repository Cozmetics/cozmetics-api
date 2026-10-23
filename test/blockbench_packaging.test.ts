import { test, describe } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import { inspectDirectoryOrZip } from '../src/server/packager/inspector.js';
import { buildCosmeticPackage } from '../src/server/packager/builder.js';
import { validatePackageZip } from '../src/server/packager/validator.js';

describe('Blockbench (.bbmodel) Automatic Pipeline Tests', () => {
  const sampleBbmodelPath = path.join(
    '/home/arc/MC-Projects/cozmetics_components/cozmetics-assets',
    'Ent & Mushroom Pets',
    'mushroom_pet.bbmodel'
  );

  test('should automatically inspect, extract embedded textures and animations from .bbmodel', () => {
    assert.ok(fs.existsSync(sampleBbmodelPath), 'Sample mushroom_pet.bbmodel must exist');

    const tempDir = path.join(process.cwd(), 'data', 'temp', 'test-bb-auto-inspect');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const destFile = path.join(tempDir, 'mushroom_pet.bbmodel');
      fs.copyFileSync(sampleBbmodelPath, destFile);

      // Perform inspection
      const result = inspectDirectoryOrZip(tempDir);

      // Verify model format detection
      assert.strictEqual(result.modelFormat, 'blockbench');
      assert.strictEqual(result.suggestedModel, 'mushroom_pet.bbmodel');

      // Verify embedded texture extraction
      assert.strictEqual(result.hasEmbeddedTextures, true);
      assert.ok(result.suggestedTexture, 'Suggested texture should be auto-extracted');
      assert.strictEqual(result.suggestedTexture, 'pet_mushroompet.png');

      const extractedPngPath = path.join(tempDir, 'pet_mushroompet.png');
      assert.ok(fs.existsSync(extractedPngPath), 'Extracted PNG file should physically exist on disk');

      // Verify embedded animations detection
      assert.strictEqual(result.hasEmbeddedAnimations, true);
      assert.strictEqual(result.isAnimated, true);
      assert.ok(result.discoveredAnimations.includes('idle'));
      assert.strictEqual(result.suggestedIdleAnimation, 'idle');

      // Verify suggested sizing & positioning
      assert.strictEqual(result.suggestedCategory, 'PET');
      assert.strictEqual(result.suggestedSlot, 'BODY');
      assert.ok(result.suggestedScale !== undefined && result.suggestedScale < 0.6);
      assert.strictEqual(result.suggestedTranslateY, 0.65);

      // Verify files list contains both model and auto-extracted texture
      const fileNames = result.files.map((f) => f.relativePath);
      assert.ok(fileNames.includes('mushroom_pet.bbmodel'));
      assert.ok(fileNames.includes('pet_mushroompet.png'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should build and validate a .bbmodel package without needing external animation json', async () => {
    const bbmodelBuffer = fs.readFileSync(sampleBbmodelPath);
    const bbJson = JSON.parse(bbmodelBuffer.toString('utf8'));
    const base64Data = bbJson.textures[0].source.replace(/^data:image\/[a-z0-9.+_-]+;base64,/i, '');
    const textureBuffer = Buffer.from(base64Data, 'base64');

    // Build package where animation is embedded directly in .bbmodel
    const buildOutput = await buildCosmeticPackage({
      id: 'cozmetics:mushroom_pet',
      version: '1.0.0',
      slot: 'BODY',
      transform: {
        scale: 0.35,
        translate_y: 0.65,
        static_lighting: false
      },
      model: {
        filename: 'mushroom_pet.bbmodel',
        buffer: bbmodelBuffer
      },
      texture: {
        filename: 'pet_mushroompet.png',
        buffer: textureBuffer
      },
      animation: {
        filename: 'mushroom_pet.bbmodel',
        buffer: bbmodelBuffer,
        idleAnimation: 'idle'
      }
    });

    assert.ok(buildOutput.zipBuffer.length > 0);
    assert.ok(buildOutput.hash.length === 64);

    // Verify manifest contents
    const manifest = buildOutput.manifestObj;
    assert.strictEqual(manifest.id, 'cozmetics:mushroom_pet');
    assert.strictEqual(manifest.model, 'mushroom_pet.bbmodel');
    assert.strictEqual(manifest.texture, 'pet_mushroompet.png');
    assert.strictEqual(manifest.animation, 'mushroom_pet.bbmodel');
    assert.strictEqual(manifest.idle_animation, 'idle');
    assert.strictEqual(manifest.transform.scale, 0.35);
    assert.strictEqual(manifest.transform.translate_y, 0.65);

    // Inspect the generated zip archive entries
    const zip = new AdmZip(buildOutput.zipBuffer);
    const entryNames = zip.getEntries().map((e) => e.entryName);

    assert.ok(entryNames.includes('manifest.json'));
    assert.ok(entryNames.includes('mushroom_pet.bbmodel'));
    assert.ok(entryNames.includes('pet_mushroompet.png'));

    // Ensure model entry is NOT duplicated
    const modelOccurrences = entryNames.filter((n) => n === 'mushroom_pet.bbmodel').length;
    assert.strictEqual(modelOccurrences, 1, 'Model file should appear only once in zip');

    // Verify zip passes all security & manifest integrity checks
    const tempZipFile = path.join(process.cwd(), 'data', 'temp', 'test-bb-built.zip');
    fs.mkdirSync(path.dirname(tempZipFile), { recursive: true });
    fs.writeFileSync(tempZipFile, buildOutput.zipBuffer);

    try {
      const validation = validatePackageZip(tempZipFile, buildOutput.hash);
      assert.strictEqual(validation.valid, true, `Validation failed: ${validation.errors.join('; ')}`);
    } finally {
      fs.rmSync(tempZipFile, { force: true });
    }
  });
});

