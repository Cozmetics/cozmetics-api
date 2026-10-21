import React from 'react';
import { CosmeticItem } from '../types.js';
import { Eye, EyeOff, FileCode, Trash2, Download } from 'lucide-react';

interface CosmeticCardProps {
  item: CosmeticItem;
  isAdmin: boolean;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onDelete: (id: string) => void;
  onViewManifest: (item: CosmeticItem) => void;
}

export const CosmeticCard: React.FC<CosmeticCardProps> = ({
  item,
  isAdmin,
  onPublish,
  onUnpublish,
  onDelete,
  onViewManifest
}) => {
  const thumbUrl = `/api/thumbnails/${encodeURIComponent(item.thumbnail_filename)}`;
  const packageDownloadUrl = `/api/packages/${encodeURIComponent(item.id)}/${encodeURIComponent(item.version)}`;

  const badgeClass =
    item.status === 'published'
      ? 'badge-published'
      : item.status === 'draft'
      ? 'badge-draft'
      : 'badge-unpublished';

  return (
    <div className="card">
      <div className="card-thumb-wrapper">
        <span className={`card-badge ${badgeClass}`}>{item.status}</span>
        {item.is_animated === 1 && <span className="card-anim-tag">Animated</span>}
        <img
          src={thumbUrl}
          alt={item.name}
          className="card-thumb"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%234f5d8a" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
          }}
        />
      </div>

      <div className="card-body">
        <div className="card-header-row">
          <h3 className="card-title">{item.name}</h3>
          <span className="card-version">v{item.version}</span>
        </div>

        <div className="card-id">{item.id}</div>

        <div className="card-specs">
          <div className="spec-item">
            <span className="spec-label">Category</span>
            <span className="spec-val">{item.category}</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">Slot</span>
            <span className="spec-val">{item.slot}</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">Model</span>
            <span className="spec-val" title={item.model_filename}>
              {item.model_filename.length > 15 ? item.model_filename.substring(0, 12) + '...' : item.model_filename}
            </span>
          </div>
          <div className="spec-item">
            <span className="spec-label">Package Hash</span>
            <span className="spec-val" title={item.hash}>
              {item.hash.substring(0, 8)}...
            </span>
          </div>
        </div>

        {item.description && <p className="card-desc">{item.description}</p>}

        <div className="card-actions">
          <div className="card-actions-group">
            <button
              className="btn-secondary action-btn-sm"
              onClick={() => onViewManifest(item)}
              title="Inspect generated manifest"
            >
              <FileCode size={14} />
              <span>Manifest</span>
            </button>
            <a
              href={packageDownloadUrl}
              className="btn-secondary action-btn-sm"
              download
              title="Download verified ZIP package"
            >
              <Download size={14} />
              <span>ZIP</span>
            </a>
          </div>

          {isAdmin && (
            <div className="card-actions-group">
              {item.status === 'published' ? (
                <button
                  className="btn-secondary action-btn-sm"
                  onClick={() => onUnpublish(item.id)}
                  title="Unpublish (retains package data)"
                  style={{ color: '#f59e0b' }}
                >
                  <EyeOff size={14} />
                  <span>Unpublish</span>
                </button>
              ) : (
                <button
                  className="btn-secondary action-btn-sm"
                  onClick={() => onPublish(item.id)}
                  title="Publish to player catalogue"
                  style={{ color: '#10b981' }}
                >
                  <Eye size={14} />
                  <span>Publish</span>
                </button>
              )}

              <button
                className="btn-danger-outline action-btn-sm"
                onClick={() => onDelete(item.id)}
                title="Delete cosmetic"
                style={{ padding: '0.38rem 0.5rem' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

