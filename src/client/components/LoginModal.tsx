import React, { useState } from 'react';
import { X, Lock, Shield } from 'lucide-react';
import { login } from '../api.js';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setErrorMsg('Username and password are required');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const res = await login(username, password);
    setLoading(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setErrorMsg(res.error || 'Authentication failed');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={18} color="#6366f1" />
            <h2>Admin Sign In</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-content">
            {errorMsg && <div className="alert-box alert-error">{errorMsg}</div>}

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-control"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#9ba3be' }}>
              First-time setup? Create your credentials via CLI:
              <br />
              <code style={{ color: '#a5b4fc' }}>npm run create-admin</code>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <Lock size={16} />
              <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

