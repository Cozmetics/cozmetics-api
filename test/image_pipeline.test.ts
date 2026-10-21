import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  detectImageFormat,
  SUPPORTED_IMAGE_EXTENSIONS
} from '../src/server/packager/imageDetector.js';
import { inspectDirectoryOrZip } from '../src/server/packager/inspector.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Universal Image Sniffer & Formats Pipeline', () => {
  it('should detect static PNG', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    const info = detectImageFormat(pngHeader);
    assert.strictEqual(info.format, 'PNG');
    assert.strictEqual(info.mimeType, 'image/png');
    assert.strictEqual(info.isAnimated, false);
  });

  it('should detect animated PNG (APNG) with acTL chunk', () => {
    // 8-byte PNG header + fake chunk + acTL chunk + IDAT
    const apng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x08,
      0x61, 0x63, 0x54, 0x4c, // acTL
      0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00
    ]);
    const info = detectImageFormat(apng);
    assert.strictEqual(info.format, 'APNG');
    assert.strictEqual(info.mimeType, 'image/apng');
    assert.strictEqual(info.isAnimated, true);
  });

  it('should detect static WebP', () => {
    const staticWebp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x20, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, // WEBP
      0x56, 0x50, 0x38, 0x20  // VP8_
    ]);
    const info = detectImageFormat(staticWebp);
    assert.strictEqual(info.format, 'WEBP');
    assert.strictEqual(info.mimeType, 'image/webp');
    assert.strictEqual(info.isAnimated, false);
  });

  it('should detect animated WebP with VP8X animation flag', () => {
    const animWebp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x30, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, // WEBP
      0x56, 0x50, 0x38, 0x58, // VP8X
      0x0a, 0x00, 0x00, 0x00,
      0x02, 0x00, 0x00, 0x00  // Flags byte (0x02 = animated bit)
    ]);
    const info = detectImageFormat(animWebp);
    assert.strictEqual(info.format, 'ANIMATED_WEBP');
    assert.strictEqual(info.mimeType, 'image/webp');
    assert.strictEqual(info.isAnimated, true);
  });

  it('should detect animated GIF (GIF89a / GIF87a)', () => {
    const gif89a = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00');
    const info89 = detectImageFormat(gif89a);
    assert.strictEqual(info89.format, 'GIF');
    assert.strictEqual(info89.mimeType, 'image/gif');
    assert.strictEqual(info89.isAnimated, true);

    const gif87a = Buffer.from('GIF87a\x01\x00\x01\x00\x80\x00\x00');
    const info87 = detectImageFormat(gif87a);
    assert.strictEqual(info87.format, 'GIF');
    assert.strictEqual(info87.mimeType, 'image/gif');
  });

  it('should detect JPEG / JPG', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const info = detectImageFormat(jpeg);
    assert.strictEqual(info.format, 'JPEG');
    assert.strictEqual(info.mimeType, 'image/jpeg');
    assert.strictEqual(info.isAnimated, false);
  });

  it('should detect BMP', () => {
    const bmp = Buffer.from([0x42, 0x4d, 0x36, 0x00, 0x00, 0x00]);
    const info = detectImageFormat(bmp);
    assert.strictEqual(info.format, 'BMP');
    assert.strictEqual(info.mimeType, 'image/bmp');
    assert.strictEqual(info.isAnimated, false);
  });

  it('should detect TIFF (little & big endian)', () => {
    const tiffLe = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const infoLe = detectImageFormat(tiffLe);
    assert.strictEqual(infoLe.format, 'TIFF');
    assert.strictEqual(infoLe.mimeType, 'image/tiff');

    const tiffBe = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
    const infoBe = detectImageFormat(tiffBe);
    assert.strictEqual(infoBe.format, 'TIFF');
    assert.strictEqual(infoBe.mimeType, 'image/tiff');
  });

  it('should handle corrupt or unknown data safely', () => {
    assert.strictEqual(detectImageFormat(null).format, 'UNKNOWN');
    assert.strictEqual(detectImageFormat(Buffer.alloc(2)).format, 'UNKNOWN');
    assert.strictEqual(detectImageFormat(Buffer.from('not an image')).format, 'UNKNOWN');
  });

  it('should properly inspect directories containing diverse image formats', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coz-img-test-'));
    try {
      // Create model
      fs.writeFileSync(
        path.join(tempDir, 'model.geo.json'),
        JSON.stringify({ 'minecraft:geometry': [{ description: { identifier: 'geometry.test' } }] })
      );

      // Create animated GIF texture
      fs.writeFileSync(path.join(tempDir, 'texture.gif'), Buffer.from('GIF89a\x10\x00\x10\x00\x80\x00\x00'));

      // Create card thumbnail
      fs.writeFileSync(
        path.join(tempDir, 'thumbnail_card.webp'),
        Buffer.from([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20])
      );

      const inspection = inspectDirectoryOrZip(tempDir);
      assert.strictEqual(inspection.suggestedModel, 'model.geo.json');
      assert.strictEqual(inspection.suggestedTexture, 'texture.gif');
      assert.strictEqual(inspection.suggestedThumbnail, 'thumbnail_card.webp');
      assert.strictEqual(inspection.hasAnimatedTexture, true);
      assert.strictEqual(inspection.animatedTextureFormat, 'GIF');

      const gifFile = inspection.files.find((f) => f.relativePath === 'texture.gif');
      assert.strictEqual(gifFile?.imageFormat, 'GIF');
      assert.strictEqual(gifFile?.isAnimatedImage, true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

