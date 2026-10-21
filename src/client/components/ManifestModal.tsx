import React, { useState } from 'react';
import { X, Copy, Check, FileCode } from 'lucide-react';
import { CosmeticItem } from '../types.js';

interface ManifestModalProps {
  item: CosmeticItem | null;
  onClose: () => void;
}

export const ManifestModal: React.FC<ManifestModalProps> = ({ item, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const manifestObj: any = {
    id: item.id,
    version: item.version,
    model: item.model_filename,
    texture: item.texture_filename,
    slot: item.slot,
    transform: {
      translate_y: item.translate_y,
      scale: item.scale,
      static_lighting: Boolean(item.static_lighting)
    }
  };

  if (item.is_animated && item.animation_filename) {
    manifestObj.animation = item.animation_filename;
    if (item.idle_animation) {
      manifestObj.idle_animation = item.idle_animation;
    }
  }

  const manifestJson = JSON.stringify(manifestObj, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(manifestJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileCode size={18} color="#818cf8" />
            <h2>{item.name} • manifest.json</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-content">
          <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#9ba3be' }}>
            This exact JSON manifest schema is bundled into the cosmetic ZIP package and consumed directly by the Minecraft mod loader.
          </div>
          <pre className="json-preview" style={{ maxHeight: '350px' }}>
            {manifestJson}
          </pre>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleCopy}>
            {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy JSON'}</span>
          </button>
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

