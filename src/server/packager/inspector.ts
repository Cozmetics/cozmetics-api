import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {
  detectImageFormat,
  SUPPORTED_IMAGE_EXTENSIONS,
  DetectedImageFormat
} from './imageDetector.js';

export interface InspectedAssetFile {
  relativePath: string;
  size: number;
  extension: string;
  type: 'model' | 'texture' | 'animation' | 'meta' | 'manifest' | 'unknown';
  imageFormat?: DetectedImageFormat;
  isAnimatedImage?: boolean;
}

export interface InspectionResult {
  files: InspectedAssetFile[];
  suggestedModel?: string;
  suggestedTexture?: string;
  suggestedAnimation?: string;
  suggestedThumbnail?: string;
  discoveredAnimations: string[];
  suggestedIdleAnimation?: string;
  isAnimated: boolean;
  hasAnimatedTexture?: boolean;
  animatedTextureFormat?: string;
  suggestedCategory?: string;
  suggestedSlot?: string;
  modelFormat?: 'bedrock_geo' | 'blockbench';
  hasEmbeddedTextures?: boolean;
  hasEmbeddedAnimations?: boolean;
  extractedTextureFilename?: string;
  suggestedScale?: number;
  suggestedTranslateY?: number;
  errors: string[];
  warnings: string[];
}

export function inspectDirectoryOrZip(targetPath: string): InspectionResult {
  const result: InspectionResult = {
    files: [],
    discoveredAnimations: [],
    isAnimated: false,
    errors: [],
    warnings: []
  };

  const stat = fs.statSync(targetPath);
  const tempFilesMap = new Map<string, Buffer>();

  if (stat.isFile() && targetPath.toLowerCase().endsWith('.zip')) {
    try {
      const zip = new AdmZip(targetPath);
      const entries = zip.getEntries();
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName.replace(/\\/g, '/');

        // Security check
        if (entryName.includes('..') || entryName.startsWith('/') || entryName.includes(':')) {
          result.errors.push(`Malicious path in ZIP entry: ${entryName}`);
          continue;
        }

        const buffer = entry.getData();
        tempFilesMap.set(entryName, buffer);
      }
    } catch (e: any) {
      result.errors.push(`Failed to read ZIP archive: ${e.message}`);
      return result;
    }
  } else if (stat.isDirectory()) {
    function walkDir(dir: string, baseDir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          walkDir(fullPath, baseDir);
        } else if (entry.isFile()) {
          tempFilesMap.set(relPath, fs.readFileSync(fullPath));
        }
      }
    }
    walkDir(targetPath, targetPath);
  } else {
    result.errors.push(`Target is neither a directory nor a zip file: ${targetPath}`);
    return result;
  }

  // Pre-process .bbmodel files to extract embedded textures, animations & dimensions
  for (const [relPath, buffer] of Array.from(tempFilesMap.entries())) {
    if (relPath.toLowerCase().endsWith('.bbmodel')) {
      result.modelFormat = 'blockbench';
      try {
        const bbJson = JSON.parse(buffer.toString('utf8'));
        const modelBaseName = path.basename(relPath, path.extname(relPath));

        // 1. Extract embedded base64 textures
        if (Array.isArray(bbJson.textures) && bbJson.textures.length > 0) {
          result.hasEmbeddedTextures = true;
          for (let i = 0; i < bbJson.textures.length; i++) {
            const tex = bbJson.textures[i];
            if (tex && typeof tex.source === 'string' && tex.source.includes('base64,')) {
              const base64Data = tex.source.replace(/^data:image\/[a-z0-9.+_-]+;base64,/i, '');
              if (base64Data) {
                const texBuffer = Buffer.from(base64Data, 'base64');
                const rawName = tex.name || `${modelBaseName}_texture`;
                const safeName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
                const texFilename = `${safeName}.png`;

                // If inspecting a physical directory on disk, write the extracted PNG file
                if (stat.isDirectory()) {
                  const outPath = path.join(targetPath, texFilename);
                  if (!fs.existsSync(outPath)) {
                    fs.writeFileSync(outPath, texBuffer);
                  }
                }

                // Add to tempFilesMap so it is indexed as a texture asset
                if (!tempFilesMap.has(texFilename)) {
                  tempFilesMap.set(texFilename, texBuffer);
                }

                if (!result.extractedTextureFilename) {
                  result.extractedTextureFilename = texFilename;
                }
              }
            }
          }
        }

        // 2. Extract embedded animations
        if (Array.isArray(bbJson.animations) && bbJson.animations.length > 0) {
          result.hasEmbeddedAnimations = true;
          result.isAnimated = true;
          for (const anim of bbJson.animations) {
            if (anim && typeof anim.name === 'string' && !result.discoveredAnimations.includes(anim.name)) {
              result.discoveredAnimations.push(anim.name);
            }
          }
          if (result.discoveredAnimations.length > 0) {
            const idleCandidate = result.discoveredAnimations.find(
              (a) =>
                a.toLowerCase().includes('idle') ||
                a.toLowerCase().includes('fly') ||
                a.toLowerCase().includes('float') ||
                a.toLowerCase().includes('walk')
            );
            result.suggestedIdleAnimation = idleCandidate || result.discoveredAnimations[0];
          }
        }

        // 3. Compute bounding box dimensions from elements
        if (Array.isArray(bbJson.elements) && bbJson.elements.length > 0) {
          let minX = Infinity, minY = Infinity, minZ = Infinity;
          let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
          let hasValidElements = false;

          for (const el of bbJson.elements) {
            if (Array.isArray(el.from) && Array.isArray(el.to) && el.from.length === 3 && el.to.length === 3) {
              hasValidElements = true;
              minX = Math.min(minX, el.from[0], el.to[0]);
              minY = Math.min(minY, el.from[1], el.to[1]);
              minZ = Math.min(minZ, el.from[2], el.to[2]);
              maxX = Math.max(maxX, el.from[0], el.to[0]);
              maxY = Math.max(maxY, el.from[1], el.to[1]);
              maxZ = Math.max(maxZ, el.from[2], el.to[2]);
            }
          }

          if (hasValidElements) {
            const width = maxX - minX;
            const height = maxY - minY;
            const depth = maxZ - minZ;
            const maxDim = Math.max(width, height, depth);

            // Suggest scale & position presets based on dimensions & name
            const lowerModel = modelBaseName.toLowerCase();
            if (lowerModel.includes('pet') || lowerModel.includes('dragon') || lowerModel.includes('ent') || lowerModel.includes('mushroom')) {
              // Shoulder / Companion miniature preset
              result.suggestedCategory = 'PET';
              result.suggestedSlot = 'BODY';
              result.suggestedScale = maxDim > 20 ? 0.35 : 0.45;
              result.suggestedTranslateY = 0.65;
            } else if (lowerModel.includes('hat') || lowerModel.includes('helmet') || lowerModel.includes('crown') || lowerModel.includes('mask')) {
              // Headwear preset
              result.suggestedCategory = 'HEADWEAR';
              result.suggestedSlot = 'HEAD';
              result.suggestedScale = 0.70;
              result.suggestedTranslateY = 0.00;
            } else if (maxDim > 24) {
              result.suggestedScale = 0.35;
              result.suggestedTranslateY = 0.60;
            } else if (maxDim > 14) {
              result.suggestedScale = 0.50;
              result.suggestedTranslateY = 0.30;
            } else {
              result.suggestedScale = 0.75;
              result.suggestedTranslateY = 0.00;
            }
          }
        }
      } catch (err: any) {
        result.warnings.push(`Warning reading .bbmodel file '${relPath}': ${err.message}`);
      }
    }
  }

  // Analyze files
  const candidateModels: string[] = [];
  const candidateTextures: string[] = [];
  const candidateThumbnails: string[] = [];
  const candidateAnimations: string[] = [];

  for (const [relPath, buffer] of tempFilesMap.entries()) {
    const ext = path.extname(relPath).toLowerCase().replace('.', '');
    const filename = path.basename(relPath).toLowerCase();
    let type: InspectedAssetFile['type'] = 'unknown';
    let imageFormat: DetectedImageFormat | undefined;
    let isAnimatedImage = false;

    if (filename === 'manifest.json') {
      type = 'manifest';
    } else if (ext === 'bbmodel') {
      type = 'model';
      candidateModels.push(relPath);
      result.modelFormat = 'blockbench';
    } else if (SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
      type = 'texture';
      const imgInfo = detectImageFormat(buffer);
      imageFormat = imgInfo.format;
      isAnimatedImage = imgInfo.isAnimated;

      if (imgInfo.isAnimated) {
        result.hasAnimatedTexture = true;
        result.animatedTextureFormat = imgInfo.format;
      }

      const isLikelyThumbnail =
        filename.includes('thumb') ||
        filename.includes('card') ||
        filename.includes('icon') ||
        filename.includes('preview');

      if (isLikelyThumbnail) {
        candidateThumbnails.push(relPath);
      } else {
        candidateTextures.push(relPath);
      }
    } else if (ext === 'json') {
      // Differentiate between geo, animation, meta
      try {
        const parsed = JSON.parse(buffer.toString('utf8'));
        if (parsed['minecraft:geometry'] || filename.includes('geo')) {
          type = 'model';
          candidateModels.push(relPath);
          result.modelFormat = 'bedrock_geo';
        } else if (parsed['animations'] || filename.includes('animation') || filename.includes('anim')) {
          type = 'animation';
          candidateAnimations.push(relPath);

          // Extract animation identifiers
          if (parsed['animations'] && typeof parsed['animations'] === 'object') {
            for (const animName of Object.keys(parsed['animations'])) {
              result.discoveredAnimations.push(animName);
            }
          }
        } else {
          type = 'meta';
        }
      } catch {
        type = 'unknown';
      }
    } else if (ext === 'mcmeta') {
      type = 'meta';
    }

    result.files.push({
      relativePath: relPath,
      size: buffer.length,
      extension: ext,
      type,
      imageFormat,
      isAnimatedImage
    });
  }

  // Model suggestions
  if (candidateModels.length === 1) {
    result.suggestedModel = candidateModels[0];
  } else if (candidateModels.length > 1) {
    result.warnings.push(`Multiple model files found (${candidateModels.join(', ')}). Admin selection required.`);
    result.suggestedModel = candidateModels[0];
  }

  // Texture and thumbnail suggestions
  if (candidateTextures.length === 0 && candidateThumbnails.length > 0) {
    // If only thumbnail candidates exist, fall back to them for model texture
    candidateTextures.push(...candidateThumbnails);
  }

  if (candidateTextures.length === 1) {
    result.suggestedTexture = candidateTextures[0];
  } else if (candidateTextures.length > 1) {
    result.warnings.push(`Multiple texture files found (${candidateTextures.join(', ')}). Admin selection required.`);
    result.suggestedTexture = candidateTextures[0];
  }

  if (candidateThumbnails.length > 0) {
    result.suggestedThumbnail = candidateThumbnails[0];
  } else if (candidateTextures.length > 0) {
    result.suggestedThumbnail = candidateTextures[0];
  }

  // Animation suggestions
  if (candidateAnimations.length > 0) {
    result.isAnimated = true;
    result.suggestedAnimation = candidateAnimations[0];

    // Suggest idle animation
    if (result.discoveredAnimations.length > 0) {
      const idleCandidate = result.discoveredAnimations.find(
        (a) => a.toLowerCase().includes('idle') || a.toLowerCase().includes('fly') || a.toLowerCase().includes('float')
      );
      result.suggestedIdleAnimation = idleCandidate || result.discoveredAnimations[0];
    }
  }

  // Category and slot suggestions (only if not already determined by model-specific inspection)
  if (!result.suggestedCategory || !result.suggestedSlot) {
    const allNames = Array.from(tempFilesMap.keys()).map((k) => k.toLowerCase()).join(' ');
    if (allNames.includes('wing')) {
      result.suggestedCategory = result.suggestedCategory || 'WINGS';
      result.suggestedSlot = result.suggestedSlot || 'BODY';
    } else if (allNames.includes('pet') || allNames.includes('dragon')) {
      result.suggestedCategory = result.suggestedCategory || 'PET';
      result.suggestedSlot = result.suggestedSlot || 'BODY';
    } else if (allNames.includes('aura')) {
      result.suggestedCategory = result.suggestedCategory || 'AURA';
      result.suggestedSlot = result.suggestedSlot || 'BODY';
    } else if (allNames.includes('boot') || allNames.includes('shoe') || allNames.includes('sneaker')) {
      result.suggestedCategory = result.suggestedCategory || 'BOOTS';
      result.suggestedSlot = result.suggestedSlot || 'LEGS';
    } else if (allNames.includes('fist') || allNames.includes('claw') || allNames.includes('glove')) {
      result.suggestedCategory = result.suggestedCategory || 'FISTS';
      result.suggestedSlot = result.suggestedSlot || 'ARMS';
    } else if (allNames.includes('mask') || allNames.includes('goggle') || allNames.includes('face')) {
      result.suggestedCategory = result.suggestedCategory || 'FACE';
      result.suggestedSlot = result.suggestedSlot || 'HEAD';
    } else if (allNames.includes('hat') || allNames.includes('helmet') || allNames.includes('crown')) {
      result.suggestedCategory = result.suggestedCategory || 'HEADWEAR';
      result.suggestedSlot = result.suggestedSlot || 'HEAD';
    } else if (allNames.includes('backpack') || allNames.includes('back') || allNames.includes('tail')) {
      result.suggestedCategory = result.suggestedCategory || 'BACK';
      result.suggestedSlot = result.suggestedSlot || 'BODY';
    }
  }

  return result;
}
