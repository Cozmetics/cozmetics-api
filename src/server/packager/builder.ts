import { ZipArchive } from 'archiver';
import { Writable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validatePackageZip, computeSha256Buffer } from './validator.js';

export interface ManifestTransform {
  translate_y: number;
  scale: number;
  static_lighting: boolean;
}

export interface ManifestSchema {
  id: string;
  version: string;
  model: string;
  texture: string;
  slot: string;
  transform: ManifestTransform;
  animation?: string;
  idle_animation?: string;
}

export interface BuildPackageInput {
  id: string;
  version?: string;
  slot: string;
  transform?: Partial<ManifestTransform>;
  model: { filename: string; buffer: Buffer };
  texture: { filename: string; buffer: Buffer };
  animation?: { filename: string; buffer: Buffer; idleAnimation?: string };
  extraFiles?: Array<{ filename: string; buffer: Buffer }>;
}

export interface BuildPackageOutput {
  zipBuffer: Buffer;
  hash: string;
  manifestJson: string;
  manifestObj: ManifestSchema;
}

export async function buildCosmeticPackage(input: BuildPackageInput): Promise<BuildPackageOutput> {
  // 1. Sanitize ID
  const cleanId = input.id.trim();
  const fullId = cleanId.includes(':') ? cleanId : `cozmetics:${cleanId}`;

  const version = input.version?.trim() || '1.0.0';
  const slot = (input.slot || 'BODY').toUpperCase();

  const transform: ManifestTransform = {
    translate_y: typeof input.transform?.translate_y === 'number' ? input.transform.translate_y : 0.0,
    scale: typeof input.transform?.scale === 'number' ? input.transform.scale : 1.0,
    static_lighting: Boolean(input.transform?.static_lighting)
  };

  // 2. Prepare paths inside ZIP
  const modelZipPath = path.basename(input.model.filename);
  const textureZipPath = path.basename(input.texture.filename);

  const manifestObj: ManifestSchema = {
    id: fullId,
    version,
    model: modelZipPath,
    texture: textureZipPath,
    slot,
    transform
  };

  let animationZipPath: string | undefined;
  if (input.animation && input.animation.buffer && input.animation.buffer.length > 0) {
    animationZipPath = path.basename(input.animation.filename);
    manifestObj.animation = animationZipPath;
    if (input.animation.idleAnimation) {
      manifestObj.idle_animation = input.animation.idleAnimation;
    }
  }

  const manifestJson = JSON.stringify(manifestObj, null, 2);
  const manifestBuffer = Buffer.from(manifestJson, 'utf8');

  // 3. Assemble entries deterministically
  const entries: Array<{ name: string; buffer: Buffer }> = [
    { name: 'manifest.json', buffer: manifestBuffer },
    { name: modelZipPath, buffer: input.model.buffer },
    { name: textureZipPath, buffer: input.texture.buffer }
  ];

  if (animationZipPath && input.animation) {
    // Only add if animation file is distinct from the model file (e.g. .animation.json vs embedded in .bbmodel)
    if (animationZipPath !== modelZipPath && !entries.some((e) => e.name === animationZipPath)) {
      entries.push({ name: animationZipPath, buffer: input.animation.buffer });
    }
  }

  if (input.extraFiles) {
    for (const extra of input.extraFiles) {
      const extraName = path.basename(extra.filename);
      // Avoid collisions with main assets
      if (!entries.some((e) => e.name === extraName)) {
        entries.push({ name: extraName, buffer: extra.buffer });
      }
    }
  }

  // Sort entries alphabetically for deterministic output
  entries.sort((a, b) => a.name.localeCompare(b.name));

  // Fixed timestamp for deterministic zip creation (epoch or 2026-01-01)
  const fixedDate = new Date('2026-01-01T00:00:00Z');

  const chunks: Buffer[] = [];
  const writableStream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }
  });

  const finishPromise = new Promise<void>((resolve, reject) => {
    writableStream.on('finish', () => resolve());
    writableStream.on('error', reject);
  });

  const archive = new ZipArchive({
    zlib: { level: 9 }
  });

  archive.pipe(writableStream);

  for (const entry of entries) {
    archive.append(entry.buffer, { name: entry.name, date: fixedDate });
  }

  await archive.finalize();
  await finishPromise;

  const zipBuffer = Buffer.concat(chunks);
  const hash = computeSha256Buffer(zipBuffer);

  // 4. Validate output ZIP against security rules
  const tempTestFile = path.join(
    process.cwd(),
    'data',
    'temp',
    `build-verify-${crypto.randomBytes(8).toString('hex')}.zip`
  );
  fs.mkdirSync(path.dirname(tempTestFile), { recursive: true });
  fs.writeFileSync(tempTestFile, zipBuffer);

  try {
    const validation = validatePackageZip(tempTestFile, hash);
    if (!validation.valid) {
      throw new Error(`Generated package failed validation: ${validation.message}`);
    }
  } finally {
    fs.rmSync(tempTestFile, { force: true });
  }

  return {
    zipBuffer,
    hash,
    manifestJson,
    manifestObj
  };
}
