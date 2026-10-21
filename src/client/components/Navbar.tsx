import React from 'react';
import { Sparkles, Plus, LogIn, LogOut, ShieldCheck, ExternalLink } from 'lucide-react';

interface NavbarProps {
  isAdmin: boolean;
  adminUsername?: string;
  onOpenUpload: () => void;
  onOpenLogin: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isAdmin,
  adminUsername,
  onOpenUpload,
  onOpenLogin,
  onLogout
}) => {
  return (
    <nav className="navbar">
      <div className="brand">
        <div className="brand-icon">
          <Sparkles size={18} />
        </div>
        <div className="brand-title">Cozmetics Studio</div>
        <span className="brand-badge">Publishing Engine</span>
      </div>

      <div className="nav-actions">
        <a
          href="/api/catalog"
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
          style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
          title="View published catalogue API JSON"
        >
          <ExternalLink size={14} />
          <span>Live API</span>
        </a>

        {isAdmin ? (
          <>
            <button className="btn-primary" onClick={onOpenUpload}>
              <Plus size={16} />
              <span>Publish Cosmetic</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#9ba3be', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <ShieldCheck size={16} color="#10b981" />
                <strong>{adminUsername}</strong>
              </span>
              <button
                className="btn-secondary"
                onClick={onLogout}
                style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                title="Log Out"
              >
                <LogOut size={14} />
              </button>
            </div>
          </>
        ) : (
          <button className="btn-primary" onClick={onOpenLogin}>
            <LogIn size={16} />
            <span>Admin Sign In</span>
          </button>
        )}
      </div>
    </nav>
  );
};

