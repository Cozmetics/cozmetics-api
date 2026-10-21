# Cozmetics Publishing Service & Studio

Minimal, production-conscious cosmetic publishing backend and single-page admin website ("Cozmetics Studio") served from a single application and domain.

- **Admin Web Studio**: Served at `GET /` (compiled Vite + React single-page application).
- **Public & Mod API**: Served under `/api/` (with compatibility aliases for `/mod/catalogue`).
- **Target Domain**: `https://catalog.cozmetics.arcn.online` (or `http://localhost:3001` for local development/testing).

---

## Features

1. **Single Application & Same-Origin**:
   - Zero CORS complications: frontend and backend run as one unified service.
   - Built on Fastify with TypeScript and Node.js 22 built-in SQLite (`node:sqlite`).
2. **Deterministic & Secure Packaging**:
   - Strict ZIP Slip protection (rejects path traversals `..`, leading `/`, `\`, `:`).
   - Enforces package limits: <= 15MB package, <= 10MB per entry, <= 30MB total uncompressed, <= 60 files.
   - Restricts file extensions strictly to `.json`, `.bbmodel`, `.png`, `.webp`, `.mcmeta`.
   - Generates exact `manifest.json` required by the Minecraft mod loader.
   - Computes SHA-256 package hash for cache validation.
3. **Admin Studio Interface**:
   - Polished dark UI with drag-and-drop file inspection.
   - Automatic geometry format detection (`bedrock_geo` vs `blockbench`).
   - Parses animation files to extract all animation identifiers and lets admin choose the idle animation.
   - Manual static thumbnail upload (PNG or WebP) for player card display.
   - Live generated `manifest.json` preview.
   - Real-time validate, build draft, publish, and safe unpublish actions.
4. **Offline Resilience & Efficient Mod Caching**:
   - Dynamic ETag caching (`W/"rev-<revision>"`) on `/api/catalog` returning `304 Not Modified`.
   - Mod downloads only lightweight catalogue JSON metadata and thumbnails during browsing.
   - Heavy ZIP packages are downloaded only on-demand when previewing or equipping.
   - Atomic publish/unpublish updates catalogue revision immediately without requiring mod rebuilds.

---

## Exact Manifest Schema Expected by Mod

Stored as `manifest.json` at the root of the cosmetic ZIP package:

```json
{
  "id": "cozmetics:blood_dragon_wings",
  "version": "1.0.0",
  "model": "demon2024BloodDragonWings.geo.json",
  "texture": "demon2024BloodDragonWings.webp",
  "slot": "BODY",
  "transform": {
    "translate_y": 0.0,
    "scale": 1.0,
    "static_lighting": false
  },
  "animation": "demon2024BloodDragonWings.animation.json",
  "idle_animation": "animation.demon2024BloodDragonWings.idle"
}
```

*Note: For static cosmetics, `animation` and `idle_animation` fields are omitted.*

### Supported Formats & Enums

- **3D Models**: Bedrock geometry (`.geo.json` / `.json`) or Blockbench (`.bbmodel`).
- **Textures**: `.png`, `.webp`, and `.mcmeta`.
- **Animations**: Bedrock animation JSON (`.animation.json` / `.json`).
- **Categories**: `WINGS`, `PET`, `AURA`, `HEADWEAR`, `FACE`, `BACK`, `FISTS`, `BOOTS` (Capes disabled).
- **Attachment Slots**: `BODY`, `PET`, `HEAD`, `ARMS`, `LEGS`.

---

## API Contract

### Public / Player Mod Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status, timestamp, revision, published count |
| `GET` | `/api/catalog` | Published cosmetic items with ETags and version hashes |
| `GET` | `/mod/catalogue` | Compatibility alias for mod client default sync |
| `GET` | `/api/catalog/:id` | Detailed metadata for a single cosmetic item |
| `GET` | `/api/packages/:id/:version` | Validated ZIP package download with SHA-256 header |
| `GET` | `/api/thumbnails/:filename` | Static PNG / WebP card thumbnail delivery |

#### Sample Catalogue Response (`GET /api/catalog`)

```json
{
  "revision": 2,
  "cosmetics": [
    {
      "id": "cozmetics:blood_dragon_wings",
      "name": "Blood Dragon Wings",
      "category": "WINGS",
      "slot": "BODY",
      "version": "1.0.0",
      "hash": "7737d6e42b2f6ef1e468205f27da086576b8ba26aeece27c9b29352efdf19a42",
      "package_url": "http://localhost:3001/api/packages/cozmetics:blood_dragon_wings/1.0.0",
      "thumbnail_url": "http://localhost:3001/api/thumbnails/cozmetics_blood_dragon_wings.webp",
      "description": "Immense leather-spanned draconic wings with burning demonic membranes.",
      "author": "Cozmetics Official",
      "transform": {
        "translate_y": 0.0,
        "scale": 1.0,
        "static_lighting": false
      }
    }
  ]
}
```

### Admin Endpoints (Authenticated)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/admin/login` | Authenticate admin, receive session token & HTTP-only cookie |
| `POST` | `/api/admin/logout` | Invalidate session and clear cookie |
| `GET` | `/api/admin/me` | Current authenticated admin profile |
| `GET` | `/api/admin/items` | Full listing including drafts and unpublished items |
| `POST` | `/api/admin/upload-temp` | Upload raw assets / archives to isolated temporary directory |
| `POST` | `/api/admin/inspect` | Inspect assets, detect geometry and parse animation names |
| `POST` | `/api/admin/validate` | Validate cosmetic parameters and generate manifest preview |
| `POST` | `/api/admin/packages` | Deterministically assemble ZIP package and thumbnail |
| `POST` | `/api/admin/packages/:id/publish` | Atomically publish item to player catalogue |
| `POST` | `/api/admin/packages/:id/unpublish`| Atomically remove item from player catalogue (retaining data) |
| `DELETE`| `/api/admin/packages/:id` | Permanently delete package files and database record |

---

## Local Development & Setup

### Requirements

- Node.js 22.x or later (includes built-in `node:sqlite`).
- npm 10.x or later.

### Installation & Build

```bash
cd /home/arc/MC-Projects/cozmetics_components/cozmetics-api

# Install dependencies
npm install

# Run automated test suite (security, packaging, API, and E2E)
npm test

# Build client and server bundles
npm run build
```

### Create the First Admin Account

Create an admin account via CLI without exposing credentials in logs:

```bash
npm run create-admin -- --username admin --password "YourStrongPassword123!"
```

*(If arguments are omitted, the script will prompt interactively).*

### Start the Service

```bash
# Start the unified production service on port 3001
npm start

# Or run in live watch development mode
npm run dev
```

Visit `http://localhost:3001` in your browser to access **Cozmetics Studio**.

---

## Storage & Persistence Architecture

Persistent data is stored in the configured `DATA_DIR` (default `./data`):

```
data/
├── metadata.db        # SQLite database (admins, sessions, cosmetics, revision)
├── packages/          # Validated cosmetic ZIP packages (<sanitized_id>-<version>.zip)
├── thumbnails/        # Uploaded card thumbnails (<sanitized_id>.<ext>)
└── temp/              # Temporary upload sessions (cleaned upon packaging)
```

### Backup and Restore

- **Backup**:
  ```bash
  tar -czf cozmetics-backup-$(date +%F).tar.gz data/
  ```
- **Restore**:
  ```bash
  tar -xzf cozmetics-backup-YYYY-MM-DD.tar.gz
  ```

---

## Production Deployment (Reverse Proxy / TLS)

Deploy behind Nginx or Caddy targeting `https://catalog.cozmetics.arcn.online`.

### Environment Variables (`.env`)

```ini
PORT=3001
HOST=127.0.0.1
DATA_DIR=/var/lib/cozmetics/data
BASE_URL=https://catalog.cozmetics.arcn.online
SESSION_SECRET=generate-a-strong-64-character-random-hex-string
NODE_ENV=production
```

### Caddy Reverse Proxy Example

```caddy
catalog.cozmetics.arcn.online {
    reverse_proxy 127.0.0.1:3001
}
```

### Nginx Reverse Proxy Example

```nginx
server {
    server_name catalog.cozmetics.arcn.online;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```
