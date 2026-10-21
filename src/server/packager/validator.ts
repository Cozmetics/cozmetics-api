import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';

export const MAX_PACKAGE_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
export const MAX_SINGLE_ENTRY_UNCOMPRESSED_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_TOTAL_UNCOMPRESSED_SIZE = 30 * 1024 * 1024; // 30 MB
export const MAX_ENTRY_COUNT = 60;

export const ALLOWED_EXTENSIONS = new Set(['json', 'bbmodel', 'png', 'webp', 'mcmeta']);
export const ALLOWED_SLOTS = new Set(['PET', 'BODY', 'HEAD', 'ARMS', 'LEGS']);
export const ALLOWED_CATEGORIES = new Set([
  'PET', 'WINGS', 'AURA', 'HEADWEAR', 'FACE', 'BACK', 'FISTS', 'BOOTS'
]);

export interface ValidationOutcome {
  valid: boolean;
  message: string;
  errors: string[];
}

export function computeSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

export function computeSha256Buffer(buffer: Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

export function validatePackageZip(zipPath: string, expectedHash?: string): ValidationOutcome {
  const errors: string[] = [];

  if (!fs.existsSync(zipPath)) {
    return { valid: false, message: `ZIP file not found at ${zipPath}`, errors: ['File does not exist'] };
  }

  const stat = fs.statSync(zipPath);
  if (stat.size === 0) {
    return { valid: false, message: 'Package file is empty (0 bytes)', errors: ['Empty file'] };
  }
  if (stat.size > MAX_PACKAGE_FILE_SIZE) {
    return {
      valid: false,
      message: `Package file size (${stat.size} bytes) exceeds limit (${MAX_PACKAGE_FILE_SIZE} bytes)`,
      errors: ['File size exceeded']
    };
  }

  if (expectedHash) {
    const actualHash = computeSha256(zipPath);
    if (actualHash.toLowerCase() !== expectedHash.trim().toLowerCase()) {
      return {
        valid: false,
        message: `SHA-256 hash mismatch! Expected: ${expectedHash}, actual: ${actualHash}`,
        errors: ['Hash mismatch']
      };
    }
  }

  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    if (entries.length > MAX_ENTRY_COUNT) {
      return {
        valid: false,
        message: `ZIP contains too many entries (${entries.length} > ${MAX_ENTRY_COUNT})`,
        errors: ['Excessive entry count']
      };
    }

    let hasManifest = false;
    let manifestData: Buffer | null = null;
    let totalUncompressed = 0;
    const entryNames = new Set<string>();

    for (const entry of entries) {
      const entryName = entry.entryName.replace(/\\/g, '/');

      // ZIP Slip and malicious path checks
      if (
        entryName.includes('..') ||
        entryName.startsWith('/') ||
        entryName.startsWith('\\') ||
        entryName.includes(':')
      ) {
        return {
          valid: false,
          message: `Malicious path detected in ZIP entry: ${entryName}`,
          errors: ['ZIP slip attempt']
        };
      }

      if (entry.isDirectory) {
        continue;
      }

      entryNames.add(entryName);

      // Entry size checks
      const uncompressedSize = entry.header.size;
      if (uncompressedSize > MAX_SINGLE_ENTRY_UNCOMPRESSED_SIZE) {
        return {
          valid: false,
          message: `Entry '${entryName}' size exceeds limit (${uncompressedSize} > ${MAX_SINGLE_ENTRY_UNCOMPRESSED_SIZE})`,
          errors: ['Entry size exceeded']
        };
      }
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_SIZE) {
        return {
          valid: false,
          message: `Total uncompressed size exceeds limit (${totalUncompressed} > ${MAX_TOTAL_UNCOMPRESSED_SIZE})`,
          errors: ['Total uncompressed size exceeded']
        };
      }

      // Extension check
      const ext = path.extname(entryName).toLowerCase().replace('.', '');
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return {
          valid: false,
          message: `Disallowed file type in ZIP entry '${entryName}': extension '.${ext}' is not permitted`,
          errors: ['Disallowed file extension']
        };
      }

      if (entryName === 'manifest.json' || entryName.endsWith('/manifest.json')) {
        hasManifest = true;
        manifestData = entry.getData();
      }
    }

    if (!hasManifest || !manifestData) {
      return {
        valid: false,
        message: "Missing required 'manifest.json' in cosmetic package",
        errors: ['Missing manifest.json']
      };
    }

    // Manifest validation
    let manifest: any;
    try {
      manifest = JSON.parse(manifestData.toString('utf8'));
    } catch {
      return {
        valid: false,
        message: 'Invalid JSON syntax in manifest.json',
        errors: ['Malformed manifest JSON']
      };
    }

    if (!manifest.id || typeof manifest.id !== 'string' || manifest.id.trim() === '') {
      errors.push("Manifest missing required non-empty 'id' field");
    }

    if (!manifest.model || typeof manifest.model !== 'string' || manifest.model.trim() === '') {
      errors.push("Manifest missing required non-empty 'model' field");
    } else if (!entryNames.has(manifest.model)) {
      errors.push(`Manifest references model '${manifest.model}' which is not present in ZIP`);
    }

    if (!manifest.texture || typeof manifest.texture !== 'string' || manifest.texture.trim() === '') {
      errors.push("Manifest missing required non-empty 'texture' field");
    } else if (!entryNames.has(manifest.texture)) {
      errors.push(`Manifest references texture '${manifest.texture}' which is not present in ZIP`);
    }

    if (manifest.slot && !ALLOWED_SLOTS.has(String(manifest.slot).toUpperCase())) {
      errors.push(`Invalid attachment slot '${manifest.slot}'. Allowed: ${Array.from(ALLOWED_SLOTS).join(', ')}`);
    }

    if (manifest.animation) {
      if (typeof manifest.animation !== 'string' || !entryNames.has(manifest.animation)) {
        errors.push(`Manifest references animation '${manifest.animation}' which is not present in ZIP`);
      }
    }

    if (errors.length > 0) {
      return {
        valid: false,
        message: 'Package manifest validation failed: ' + errors.join('; '),
        errors
      };
    }

    return { valid: true, message: 'Package validation passed', errors: [] };
  } catch (e: any) {
    return {
      valid: false,
      message: 'Failed to inspect ZIP archive: ' + e.message,
      errors: [e.message]
    };
  }
}

