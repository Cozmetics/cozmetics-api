import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  UploadCloud,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Layers,
  RotateCcw,
  Box,
  Image as ImageIcon,
  Film
} from 'lucide-react';
import {
  uploadTempFiles,
  inspectUploadedFiles,
  validateDraft,
  buildAndSavePackage,
  deleteTempFile,
  deleteTempSession
} from '../api.js';
import { InspectionData } from '../types.js';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = ['WINGS', 'PET', 'AURA', 'HEADWEAR', 'FACE', 'BACK', 'FISTS', 'BOOTS'] as const;
const SLOTS = ['BODY', 'PET', 'HEAD', 'ARMS', 'LEGS'] as const;

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [inspection, setInspection] = useState<InspectionData | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [category, setCategory] = useState<string>('WINGS');
  const [slot, setSlot] = useState<string>('BODY');
  const [version, setVersion] = useState('1.0.0');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('Cozmetics Official');

  // File selections
  const [modelFile, setModelFile] = useState('');
  const [textureFile, setTextureFile] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState('');
  const [isAnimated, setIsAnimated] = useState(false);
  const [animationFile, setAnimationFile] = useState('');
  const [idleAnimation, setIdleAnimation] = useState('');

  // Transforms
  const [translateY, setTranslateY] = useState(0.0);
  const [scale, setScale] = useState(1.0);
  const [staticLighting, setStaticLighting] = useState(false);

  // Status & Validation
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [manifestPreview, setManifestPreview] = useState<any | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    if (uploadId) {
      deleteTempSession(uploadId);
    }
    setUploadId(null);
    setUploadedFiles([]);
    setInspection(null);
    setName('');
    setId('');
    setCategory('WINGS');
    setSlot('BODY');
    setVersion('1.0.0');
    setDescription('');
    setAuthor('Cozmetics Official');
    setModelFile('');
    setTextureFile('');
    setThumbnailFile('');
    setIsAnimated(false);
    setAnimationFile('');
    setIdleAnimation('');
    setTranslateY(0.0);
    setScale(1.0);
    setStaticLighting(false);
    setManifestPreview(null);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // Reset form when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Auto-generate ID from Name if empty
  const handleNameChange = (val: string) => {
    setName(val);
    if (!id || id.startsWith('cozmetics:')) {
      const slug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      setId(`cozmetics:${slug}`);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Pass existing uploadId so files are appended rather than resetting!
      const uploadRes = await uploadTempFiles(fileArray, uploadId);
      setUploadId(uploadRes.uploadId);
      const names = uploadRes.files.map((f: any) => f.filename);
      setUploadedFiles(names);

      // Trigger automatic asset inspection on combined session files
      const inspectRes = await inspectUploadedFiles(uploadRes.uploadId);
      setInspection(inspectRes);

      // Auto-populate fields if currently unselected
      if (!modelFile && inspectRes.suggestedModel) setModelFile(inspectRes.suggestedModel);
      if (!textureFile && inspectRes.suggestedTexture) setTextureFile(inspectRes.suggestedTexture);
      if (inspectRes.isAnimated) {
        setIsAnimated(true);
        if (!animationFile && inspectRes.suggestedAnimation) setAnimationFile(inspectRes.suggestedAnimation);
        if (!idleAnimation && inspectRes.suggestedIdleAnimation) setIdleAnimation(inspectRes.suggestedIdleAnimation);
      }
      if (!name && inspectRes.suggestedCategory) {
        setCategory(inspectRes.suggestedCategory);
      }
      if (inspectRes.suggestedSlot) setSlot(inspectRes.suggestedSlot);

      // If user uploaded a thumbnail in this batch and none selected yet
      if (!thumbnailFile) {
        const thumb = names.find(
          (n) => n.toLowerCase().includes('thumb') || (inspectRes.files.some((f) => f.relativePath === n && f.type === 'texture'))
        );
        if (thumb) {
          setThumbnailFile(thumb);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = async (filename: string) => {
    if (!uploadId) return;

    try {
      const res = await deleteTempFile(uploadId, filename);
      const remainingNames = res.files.map((f: any) => f.filename);
      setUploadedFiles(remainingNames);

      // Reset any selectors that were pointing to this file
      if (modelFile === filename) setModelFile('');
      if (textureFile === filename) setTextureFile('');
      if (thumbnailFile === filename) setThumbnailFile('');
      if (animationFile === filename) {
        setAnimationFile('');
        setIdleAnimation('');
        setIsAnimated(false);
      }

      // Re-inspect remaining files
      if (remainingNames.length > 0) {
        const inspectRes = await inspectUploadedFiles(uploadId);
        setInspection(inspectRes);
        if (!modelFile && inspectRes.suggestedModel) setModelFile(inspectRes.suggestedModel);
        if (!textureFile && inspectRes.suggestedTexture) setTextureFile(inspectRes.suggestedTexture);
      } else {
        setInspection(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove file');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleValidate = async () => {
    if (!uploadId) {
      setErrorMsg('Please upload files before validating.');
      return;
    }

    setIsValidating(true);
    setErrorMsg(null);

    const payload = {
      uploadId,
      id,
      name,
      category,
      slot,
      version,
      modelFile,
      textureFile,
      thumbnailFile,
      isAnimated,
      animationFile: isAnimated ? animationFile : undefined,
      idleAnimation: isAnimated ? idleAnimation : undefined,
      transform: {
        translate_y: translateY,
        scale,
        static_lighting: staticLighting
      }
    };

    try {
      const res = await validateDraft(payload);
      if (res.valid) {
        setManifestPreview(res.manifestPreview);
        setSuccessMsg('Package and manifest validation passed!');
      } else {
        setErrorMsg(res.errors.join('; '));
        setManifestPreview(res.manifestPreview);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Validation request failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (publishImmediately: boolean) => {
    if (!uploadId) {
      setErrorMsg('Please upload assets first.');
      return;
    }
    if (!thumbnailFile) {
      setErrorMsg('Manual card thumbnail image is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const payload = {
      uploadId,
      id,
      name,
      category,
      slot,
      version,
      description,
      author,
      modelFile,
      textureFile,
      thumbnailFile,
      isAnimated,
      animationFile: isAnimated ? animationFile : undefined,
      idleAnimation: isAnimated ? idleAnimation : undefined,
      transform: {
        translate_y: translateY,
        scale,
        static_lighting: staticLighting
      },
      publishImmediately
    };

    try {
      await buildAndSavePackage(payload);
      onSuccess();
      handleClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to build package');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Layers size={20} color="#6366f1" />
            <h2>Publish Cosmetic to Catalogue</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={resetForm}
              title="Reset all fields and uploaded files"
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
            <button className="modal-close-btn" onClick={handleClose} title="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="modal-content">
          {errorMsg && <div className="alert-box alert-error">{errorMsg}</div>}
          {successMsg && <div className="alert-box alert-success">{successMsg}</div>}

          {/* 1. Drag & Drop File Upload */}
          <div
            className={`dropzone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <div className="dropzone-icon">
              <UploadCloud size={36} />
            </div>
            <div className="dropzone-title">
              {uploading ? 'Uploading and analyzing assets...' : 'Drop models, textures, animations, or ZIP archive'}
            </div>
            <div className="dropzone-desc">
              Supports .geo.json, .bbmodel, .png, .webp, .animation.json • Multiple uploads allowed
            </div>
          </div>

          {/* Uploaded Files line-by-line list with hover cross removal */}
          {uploadedFiles.length > 0 && (
            <div className="uploaded-files-container">
              <div className="uploaded-files-header">
                <span className="uploaded-files-title">
                  Attached Files ({uploadedFiles.length})
                </span>
                <span className="uploaded-files-hint">
                  Hover to remove • Drop or select more files above to append
                </span>
              </div>
              <div className="uploaded-files-list">
                {uploadedFiles.map((fn) => {
                  const ext = fn.split('.').pop()?.toLowerCase();
                  const isModel =
                    fn.endsWith('.geo.json') ||
                    fn.endsWith('.bbmodel') ||
                    (fn.endsWith('.json') && !fn.includes('anim') && !fn.includes('manifest'));
                  const isAnim = fn.includes('anim') || fn.endsWith('.animation.json');
                  const isTex = fn.endsWith('.png') || fn.endsWith('.webp');
                  const isManifest = fn === 'manifest.json';

                  return (
                    <div key={fn} className="file-item-row">
                      <div className="file-item-info">
                        {isModel && <Box size={15} color="#818cf8" />}
                        {isTex && <ImageIcon size={15} color="#34d399" />}
                        {isAnim && <Film size={15} color="#fbbf24" />}
                        {!isModel && !isTex && !isAnim && <FileCode size={15} color="#94a3b8" />}
                        <span className="file-item-name" title={fn}>
                          {fn}
                        </span>
                        <span className="file-item-badge">
                          {isModel
                            ? 'Model'
                            : isTex
                            ? 'Texture'
                            : isAnim
                            ? 'Animation'
                            : isManifest
                            ? 'Manifest'
                            : ext?.toUpperCase()}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="file-item-remove-btn"
                        onClick={() => handleRemoveFile(fn)}
                        title={`Remove ${fn}`}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Warnings from Inspector */}
          {inspection?.warnings && inspection.warnings.length > 0 && (
            <div className="alert-box alert-warning">
              {inspection.warnings.map((w, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <AlertTriangle size={14} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* 2. Configuration Form */}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Cosmetic Display Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Blood Dragon Wings"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Namespace Identifier</label>
              <input
                type="text"
                className="form-control"
                placeholder="cozmetics:blood_dragon_wings"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-control"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  // Auto-align slot to mod defaults
                  if (e.target.value === 'PET') setSlot('PET');
                  else if (['WINGS', 'AURA', 'BACK'].includes(e.target.value)) setSlot('BODY');
                  else if (['HEADWEAR', 'FACE'].includes(e.target.value)) setSlot('HEAD');
                  else if (e.target.value === 'FISTS') setSlot('ARMS');
                  else if (e.target.value === 'BOOTS') setSlot('LEGS');
                }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Attachment Slot</label>
              <select className="form-control" value={slot} onChange={(e) => setSlot(e.target.value)}>
                {SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Model & Texture Selection */}
            <div className="form-group">
              <label className="form-label">Model File (.geo.json or .bbmodel)</label>
              <select
                className="form-control"
                value={modelFile}
                onChange={(e) => setModelFile(e.target.value)}
              >
                <option value="">-- Choose Model File --</option>
                {uploadedFiles
                  .filter((f) => f.endsWith('.json') || f.endsWith('.bbmodel'))
                  .map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Texture File (.png or .webp)</label>
              <select
                className="form-control"
                value={textureFile}
                onChange={(e) => setTextureFile(e.target.value)}
              >
                <option value="">-- Choose Texture File --</option>
                {uploadedFiles
                  .filter((f) => f.endsWith('.png') || f.endsWith('.webp'))
                  .map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
              </select>
            </div>

            {/* Static Card Thumbnail */}
            <div className="form-group">
              <label className="form-label">Card Thumbnail Image (PNG / WebP)</label>
              <select
                className="form-control"
                value={thumbnailFile}
                onChange={(e) => setThumbnailFile(e.target.value)}
              >
                <option value="">-- Select Uploaded Thumbnail --</option>
                {uploadedFiles
                  .filter((f) => f.endsWith('.png') || f.endsWith('.webp'))
                  .map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Package Version</label>
              <input
                type="text"
                className="form-control"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>

            {/* Animation Toggle */}
            <div className="form-group full-width" style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isAnimated}
                  onChange={(e) => setIsAnimated(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#6366f1' }}
                />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>This cosmetic is animated</span>
              </label>
            </div>

            {/* Conditional Animation Fields */}
            {isAnimated && (
              <>
                <div className="form-group">
                  <label className="form-label">Animation File (.animation.json)</label>
                  <select
                    className="form-control"
                    value={animationFile}
                    onChange={(e) => setAnimationFile(e.target.value)}
                  >
                    <option value="">-- Choose Animation File --</option>
                    {uploadedFiles
                      .filter((f) => f.endsWith('.json'))
                      .map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Idle Animation Identifier</label>
                  {inspection?.discoveredAnimations && inspection.discoveredAnimations.length > 0 ? (
                    <select
                      className="form-control"
                      value={idleAnimation}
                      onChange={(e) => setIdleAnimation(e.target.value)}
                    >
                      <option value="">-- Select Idle Animation --</option>
                      {inspection.discoveredAnimations.map((anim) => (
                        <option key={anim} value={anim}>
                          {anim}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. animation.demon2024BloodDragonWings.idle"
                      value={idleAnimation}
                      onChange={(e) => setIdleAnimation(e.target.value)}
                    />
                  )}
                </div>
              </>
            )}

            {/* Transforms */}
            <div className="form-group">
              <label className="form-label">Translate Y Offset</label>
              <input
                type="number"
                step="0.05"
                className="form-control"
                value={translateY}
                onChange={(e) => setTranslateY(parseFloat(e.target.value) || 0.0)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Scale Factor</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                className="form-control"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value) || 1.0)}
              />
            </div>

            <div className="form-group full-width">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={staticLighting}
                  onChange={(e) => setStaticLighting(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#6366f1' }}
                />
                <span style={{ fontSize: '0.85rem' }}>Enable static fullbright lighting (for glowing cosmetics/auras)</span>
              </label>
            </div>

            <div className="form-group full-width">
              <label className="form-label">Description (optional)</label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Description of the cosmetic..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Live Generated Manifest Preview */}
          {manifestPreview && (
            <div style={{ marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <FileCode size={16} color="#818cf8" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Generated manifest.json Preview</span>
              </div>
              <pre className="json-preview">{JSON.stringify(manifestPreview, null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={resetForm} title="Reset all fields and files">
            <RotateCcw size={15} />
            <span>Reset Form</span>
          </button>

          <button className="btn-secondary" onClick={handleValidate} disabled={isValidating || uploading}>
            <FileCheck size={16} />
            <span>{isValidating ? 'Validating...' : 'Validate Package'}</span>
          </button>

          <button
            className="btn-secondary"
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting || uploading}
          >
            <Layers size={16} />
            <span>Save as Draft</span>
          </button>

          <button
            className="btn-primary"
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting || uploading}
          >
            <CheckCircle2 size={16} />
            <span>{isSubmitting ? 'Building & Publishing...' : 'Publish to Live'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
