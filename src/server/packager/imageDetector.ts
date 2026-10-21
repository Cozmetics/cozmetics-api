/**
 * Universal Image Format Sniffer for Cozmetics.
 * Detects format and animation flags matching io.github.itsarcn.cozmetics.client.texture.ImageFormat
 * in the Minecraft mod client.
 */

export type DetectedImageFormat =
  | 'PNG'
  | 'APNG'
  | 'WEBP'
  | 'ANIMATED_WEBP'
  | 'GIF'
  | 'JPEG'
  | 'BMP'
  | 'TIFF'
  | 'UNKNOWN';

export interface ImageFormatDetails {
  format: DetectedImageFormat;
  mimeType: string;
  isAnimated: boolean;
  defaultExtension: string;
}

export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'png',
  'apng',
  'webp',
  'gif',
  'jpg',
  'jpeg',
  'bmp',
  'tif',
  'tiff'
]);

export function detectImageFormat(data: Buffer | Uint8Array | null | undefined): ImageFormatDetails {
  if (!data || data.length < 4) {
    return {
      format: 'UNKNOWN',
      mimeType: 'application/octet-stream',
      isAnimated: false,
      defaultExtension: ''
    };
  }

  // 1. PNG / APNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 && // 'P'
    data[2] === 0x4e && // 'N'
    data[3] === 0x47 && // 'G'
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    if (containsApngChunk(data)) {
      return {
        format: 'APNG',
        mimeType: 'image/apng',
        isAnimated: true,
        defaultExtension: 'png'
      };
    }
    return {
      format: 'PNG',
      mimeType: 'image/png',
      isAnimated: false,
      defaultExtension: 'png'
    };
  }

  // 2. WebP signature: RIFF....WEBP (minimum 12 bytes)
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 && // 'RIFF'
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50 // 'WEBP'
  ) {
    if (isAnimatedWebP(data)) {
      return {
        format: 'ANIMATED_WEBP',
        mimeType: 'image/webp',
        isAnimated: true,
        defaultExtension: 'webp'
      };
    }
    return {
      format: 'WEBP',
      mimeType: 'image/webp',
      isAnimated: false,
      defaultExtension: 'webp'
    };
  }

  // 3. GIF signature: GIF87a or GIF89a (6 bytes)
  if (
    data.length >= 6 &&
    data[0] === 0x47 && // 'G'
    data[1] === 0x49 && // 'I'
    data[2] === 0x46 && // 'F'
    data[3] === 0x38 && // '8'
    (data[4] === 0x37 || data[4] === 0x39) && // '7' or '9'
    data[5] === 0x61 // 'a'
  ) {
    return {
      format: 'GIF',
      mimeType: 'image/gif',
      isAnimated: true,
      defaultExtension: 'gif'
    };
  }

  // 4. JPEG signature: FF D8 FF
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return {
      format: 'JPEG',
      mimeType: 'image/jpeg',
      isAnimated: false,
      defaultExtension: 'jpg'
    };
  }

  // 5. BMP signature: 42 4D ('BM')
  if (data.length >= 2 && data[0] === 0x42 && data[1] === 0x4d) {
    return {
      format: 'BMP',
      mimeType: 'image/bmp',
      isAnimated: false,
      defaultExtension: 'bmp'
    };
  }

  // 6. TIFF signature: 49 49 2A 00 (little endian) or 4D 4D 00 2A (big endian)
  if (
    data.length >= 4 &&
    ((data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2a && data[3] === 0x00) ||
      (data[0] === 0x4d && data[1] === 0x4d && data[2] === 0x00 && data[3] === 0x2a))
  ) {
    return {
      format: 'TIFF',
      mimeType: 'image/tiff',
      isAnimated: false,
      defaultExtension: 'tif'
    };
  }

  return {
    format: 'UNKNOWN',
    mimeType: 'application/octet-stream',
    isAnimated: false,
    defaultExtension: ''
  };
}

function containsApngChunk(data: Buffer | Uint8Array): boolean {
  const limit = Math.min(data.length - 4, 2048);
  for (let i = 8; i < limit; i++) {
    // 'acTL' chunk
    if (data[i] === 0x61 && data[i + 1] === 0x63 && data[i + 2] === 0x54 && data[i + 3] === 0x4c) {
      return true;
    }
    // 'IDAT' chunk marks end of animation header headers
    if (data[i] === 0x49 && data[i + 1] === 0x44 && data[i + 2] === 0x41 && data[i + 3] === 0x54) {
      break;
    }
  }
  return false;
}

function isAnimatedWebP(data: Buffer | Uint8Array): boolean {
  if (data.length >= 21) {
    // VP8X extended header chunk at offset 12
    if (data[12] === 0x56 && data[13] === 0x50 && data[14] === 0x38 && data[15] === 0x58) {
      // Offset 20 is flags byte, bit 1 is animation
      if ((data[20] & 0x02) !== 0) {
        return true;
      }
    }
  }

  // Fallback scan first 512 bytes for "ANIM" or "ANMF"
  const limit = Math.min(data.length - 4, 512);
  for (let i = 12; i < limit; i++) {
    if (data[i] === 0x41 && data[i + 1] === 0x4e && data[i + 2] === 0x49 && data[i + 3] === 0x4d) {
      return true;
    }
    if (data[i] === 0x41 && data[i + 1] === 0x4e && data[i + 2] === 0x4d && data[i + 3] === 0x46) {
      return true;
    }
  }
  return false;
}

