export interface CosmeticItem {
  id: string;
  name: string;
  category: 'PET' | 'WINGS' | 'AURA' | 'HEADWEAR' | 'FACE' | 'BACK' | 'FISTS' | 'BOOTS';
  slot: 'PET' | 'BODY' | 'HEAD' | 'ARMS' | 'LEGS';
  version: string;
  hash: string;
  package_filename: string;
  thumbnail_filename: string;
  description: string;
  author: string;
  is_animated: number;
  model_filename: string;
  texture_filename: string;
  animation_filename: string | null;
  idle_animation: string | null;
  translate_y: number;
  scale: number;
  static_lighting: number;
  status: 'published' | 'draft' | 'unpublished';
  created_at: number;
  updated_at: number;
}

export interface InspectionData {
  uploadId: string;
  files: Array<{
    relativePath: string;
    size: number;
    extension: string;
    type: string;
    imageFormat?: string;
    isAnimatedImage?: boolean;
  }>;
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
  errors: string[];
  warnings: string[];
}

