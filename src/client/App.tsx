import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { CosmeticCard } from './components/CosmeticCard.js';
import { UploadModal } from './components/UploadModal.js';
import { LoginModal } from './components/LoginModal.js';
import { ManifestModal } from './components/ManifestModal.js';
import {
  checkAuth,
  logout,
  fetchAdminItems,
  publishPackage,
  unpublishPackage,
  deletePackage
} from './api.js';
import { CosmeticItem } from './types.js';
import { Search, Filter, RefreshCw, PackageOpen } from 'lucide-react';

const CATEGORIES = ['ALL', 'WINGS', 'PET', 'AURA', 'HEADWEAR', 'FACE', 'BACK', 'FISTS', 'BOOTS'] as const;

export const App: React.FC = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUsername, setAdminUsername] = useState<string | undefined>();
  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modals
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [manifestItem, setManifestItem] = useState<CosmeticItem | null>(null);

  const refreshData = async () => {
    setLoading(true);
    const auth = await checkAuth();
    setIsAdmin(auth.authenticated);
    setAdminUsername(auth.admin?.username);

    try {
      if (auth.authenticated) {
        const adminItems = await fetchAdminItems();
        setItems(adminItems);
      } else {
        const res = await fetch('/api/catalog');
        if (res.ok) {
          const data = await res.json();
          // Map public catalogue to CosmeticItem shape
          const publicItems: CosmeticItem[] = (data.cosmetics || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            category: c.category,
            slot: c.slot || 'BODY',
            version: c.version || '1.0.0',
            hash: c.hash || '',
            package_filename: '',
            thumbnail_filename: c.thumbnail_url ? c.thumbnail_url.split('/').pop() : '',
            description: c.description || '',
            author: c.author || '',
            is_animated: 0,
            model_filename: 'model.geo.json',
            texture_filename: 'texture.webp',
            animation_filename: null,
            idle_animation: null,
            translate_y: c.transform?.translate_y || 0,
            scale: c.transform?.scale || 1,
            static_lighting: c.transform?.static_lighting ? 1 : 0,
            status: 'published',
            created_at: Date.now(),
            updated_at: Date.now()
          }));
          setItems(publicItems);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleLogout = async () => {
    await logout();
    await refreshData();
  };

  const handlePublish = async (id: string) => {
    try {
      await publishPackage(id);
      await refreshData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleUnpublish = async (id: string) => {
    try {
      await unpublishPackage(id);
      await refreshData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to completely delete '${id}'? This deletes both package files and database records.`)) {
      return;
    }
    try {
      await deletePackage(id);
      await refreshData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchId = item.id.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      return matchName || matchId || matchDesc;
    }
    return true;
  });

  const publishedCount = items.filter((i) => i.status === 'published').length;
  const draftCount = items.filter((i) => i.status === 'draft').length;

  return (
    <div className="app-container">
      <Navbar
        isAdmin={isAdmin}
        adminUsername={adminUsername}
        onOpenUpload={() => setUploadOpen(true)}
        onOpenLogin={() => setLoginOpen(true)}
        onLogout={handleLogout}
      />

      <main className="main-content">
        <div className="view-header">
          <div className="view-title">
            <h1>Cosmetics Catalogue</h1>
            <p>
              {publishedCount} published item{publishedCount === 1 ? '' : 's'} available to players
              {isAdmin && ` • ${draftCount} draft/unpublished item${draftCount === 1 ? '' : 's'}`}
            </p>
          </div>

          <div className="controls-bar">
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="search-input"
                placeholder="Search cosmetics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'ALL' ? 'All Categories' : cat}
                </option>
              ))}
            </select>

            <button
              className="btn-secondary"
              onClick={refreshData}
              title="Refresh catalogue"
              style={{ padding: '0.55rem' }}
            >
              <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            </button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '4rem 1.5rem',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '12px'
            }}
          >
            <PackageOpen size={44} color="#64748b" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#f1f5f9' }}>
              No Cosmetics Published
            </h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 1.5rem auto', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {items.length === 0
                ? 'The catalogue is currently empty. Sign in as an admin to upload, configure, and publish cosmetics for the Minecraft mod.'
                : 'No cosmetics match your current search and category filters.'}
            </p>
            {isAdmin && items.length === 0 && (
              <button className="btn-primary" onClick={() => setUploadOpen(true)}>
                Publish Your First Cosmetic
              </button>
            )}
          </div>
        ) : (
          <div className="cards-grid">
            {filteredItems.map((item) => (
              <CosmeticCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                onPublish={handlePublish}
                onUnpublish={handleUnpublish}
                onDelete={handleDelete}
                onViewManifest={(it) => setManifestItem(it)}
              />
            ))}
          </div>
        )}
      </main>

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => refreshData()}
      />

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => refreshData()}
      />

      <ManifestModal
        item={manifestItem}
        onClose={() => setManifestItem(null)}
      />
    </div>
  );
};

