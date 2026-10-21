import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

export interface InspectedAssetFile {
  relativePath: string;
  size: number;
  extension: string;
  type: 'model' | 'texture' | 'animation' | 'meta' | 'manifest' | 'unknown';
}

export interface InspectionResult {
  files: InspectedAssetFile[];
  suggestedModel?: string;
  suggestedTexture?: string;
  suggestedAnimation?: string;
  discoveredAnimations: string[];
  suggestedIdleAnimation?: string;
  isAnimated: boolean;
  suggestedCategory?: string;
  suggestedSlot?: string;
  modelFormat?: 'bedrock_geo' | 'blockbench';
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

  // Analyze files
  const candidateModels: string[] = [];
  const candidateTextures: string[] = [];
  const candidateAnimations: string[] = [];

  for (const [relPath, buffer] of tempFilesMap.entries()) {
    const ext = path.extname(relPath).toLowerCase().replace('.', '');
    const filename = path.basename(relPath).toLowerCase();
    let type: InspectedAssetFile['type'] = 'unknown';

    if (filename === 'manifest.json') {
      type = 'manifest';
    } else if (ext === 'bbmodel') {
      type = 'model';
      candidateModels.push(relPath);
      result.modelFormat = 'blockbench';
    } else if (ext === 'png' || ext === 'webp') {
      type = 'texture';
      candidateTextures.push(relPath);
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
      type
    });
  }

  // Determine suggestions
  if (candidateModels.length === 1) {
    result.suggestedModel = candidateModels[0];
  } else if (candidateModels.length > 1) {
    result.warnings.push(`Multiple model files found (${candidateModels.join(', ')}). Admin selection required.`);
    result.suggestedModel = candidateModels[0];
  }

  if (candidateTextures.length === 1) {
    result.suggestedTexture = candidateTextures[0];
  } else if (candidateTextures.length > 1) {
    result.warnings.push(`Multiple texture files found (${candidateTextures.join(', ')}). Admin selection required.`);
    result.suggestedTexture = candidateTextures[0];
  }

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

  // Determine suggested category and slot from names
  const allNames = Array.from(tempFilesMap.keys()).map((k) => k.toLowerCase()).join(' ');
  if (allNames.includes('wing')) {
    result.suggestedCategory = 'WINGS';
    result.suggestedSlot = 'BODY';
  } else if (allNames.includes('pet') || allNames.includes('dragon')) {
    result.suggestedCategory = 'PET';
    result.suggestedSlot = 'PET';
  } else if (allNames.includes('aura')) {
    result.suggestedCategory = 'AURA';
    result.suggestedSlot = 'BODY';
  } else if (allNames.includes('boot') || allNames.includes('shoe') || allNames.includes('sneaker')) {
    result.suggestedCategory = 'BOOTS';
    result.suggestedSlot = 'LEGS';
  } else if (allNames.includes('fist') || allNames.includes('claw') || allNames.includes('glove')) {
    result.suggestedCategory = 'FISTS';
    result.suggestedSlot = 'ARMS';
  } else if (allNames.includes('mask') || allNames.includes('goggle') || allNames.includes('face')) {
    result.suggestedCategory = 'FACE';
    result.suggestedSlot = 'HEAD';
  } else if (allNames.includes('hat') || allNames.includes('helmet') || allNames.includes('crown')) {
    result.suggestedCategory = 'HEADWEAR';
    result.suggestedSlot = 'HEAD';
  } else if (allNames.includes('backpack') || allNames.includes('back') || allNames.includes('tail')) {
    result.suggestedCategory = 'BACK';
    result.suggestedSlot = 'BODY';
  }

  return result;
}

