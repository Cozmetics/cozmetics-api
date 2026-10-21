import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { Repository, CosmeticRecord } from '../db/repository.js';
import { AppConfig } from '../config.js';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  createAuthMiddleware,
  SESSION_TTL_MS
} from '../auth/auth.js';
import { inspectDirectoryOrZip } from '../packager/inspector.js';
import {
  ALLOWED_CATEGORIES,
  ALLOWED_SLOTS,
  validatePackageZip,
  computeSha256
} from '../packager/validator.js';
import { buildCosmeticPackage } from '../packager/builder.js';

export function registerAdminRoutes(fastify: FastifyInstance, repo: Repository, config: AppConfig) {
  const requireAdmin = createAuthMiddleware(repo);

  // 1. Admin login with rate limiting
  fastify.post(
    '/api/admin/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      }
    },
    async (request: FastifyRequest<{ Body: { username?: string; password?: string } }>, reply: FastifyReply) => {
      const rawUsername = request.body?.username?.trim();
      const rawPassword = request.body?.password?.trim();
      if (!rawUsername || !rawPassword) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Username and password required' });
      }

      const admin = repo.getAdminByUsername(rawUsername);
      if (!admin) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
      }

      const isValid = verifyPassword(rawPassword, admin.password_hash, admin.salt);
      if (!isValid) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
      }

      const token = generateSessionToken();
      const expiresAt = Date.now() + SESSION_TTL_MS;
      repo.createSession(token, admin.id, expiresAt);

      reply.setCookie('cozmetics_session', token, {
        path: '/',
        httpOnly: true,
        secure: request.headers['x-forwarded-proto'] === 'https' || request.protocol === 'https' || (config.isProduction && !request.headers.host?.includes('localhost')),
        sameSite: 'lax',
        maxAge: Math.floor(SESSION_TTL_MS / 1000)
      });

      return reply.send({
        token,
        username: admin.username,
        expiresAt
      });
    }
  );

  // 2. Admin logout
  fastify.post('/api/admin/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies?.cozmetics_session;
    if (token) {
      repo.deleteSession(token);
    }
    reply.clearCookie('cozmetics_session', { path: '/' });
    return reply.send({ success: true, message: 'Logged out successfully' });
  });

  // 3. Admin status check
  fastify.get('/api/admin/me', { preHandler: requireAdmin }, async (request: FastifyRequest) => {
    return {
      authenticated: true,
      admin: request.admin
    };
  });

  // 4. List all cosmetic items (admin view)
  fastify.get('/api/admin/items', { preHandler: requireAdmin }, async () => {
    return {
      items: repo.getAllCosmetics(),
      revision: repo.getRevision()
    };
  });

  // 5. Temporary upload endpoint (supports multipart file uploads or zip archives, and appending to existing uploadId)
  fastify.post(
    '/api/admin/upload-temp',
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { uploadId?: string };
      const uploadId = (query.uploadId && /^[a-f0-9-]+$/i.test(query.uploadId))
        ? query.uploadId
        : crypto.randomUUID();

      const targetDir = path.join(config.tempDir, uploadId);
      fs.mkdirSync(targetDir, { recursive: true });

      const parts = request.parts();

      for await (const part of parts) {
        if (part.type === 'file') {
          const safeName = path.basename(part.filename);
          if (safeName.includes('..') || safeName.includes('/') || safeName.includes('\\')) {
            continue;
          }

          const filePath = path.join(targetDir, safeName);
          const buffer = await part.toBuffer();
          fs.writeFileSync(filePath, buffer);

          // If it's a zip archive, safely extract its contents into the upload folder for inspection
          if (safeName.toLowerCase().endsWith('.zip')) {
            try {
              const zip = new AdmZip(filePath);
              const entries = zip.getEntries();
              for (const entry of entries) {
                if (entry.isDirectory) continue;
                const entryName = entry.entryName.replace(/\\/g, '/');
                if (entryName.includes('..') || entryName.startsWith('/') || entryName.includes(':')) {
                  continue;
                }
                const extractedPath = path.join(targetDir, path.basename(entryName));
                fs.writeFileSync(extractedPath, entry.getData());
              }
            } catch {
              // Leave zip as-is if extraction fails
            }
          }
        }
      }

      // Return all accumulated files in this upload session
      const allFiles = fs.readdirSync(targetDir).map((fn) => ({
        filename: fn,
        size: fs.statSync(path.join(targetDir, fn)).size
      }));

      return reply.send({
        uploadId,
        files: allFiles
      });
    }
  );

  // 5b. Remove individual file from temporary upload session
  fastify.delete<{ Params: { uploadId: string; filename: string } }>(
    '/api/admin/upload-temp/:uploadId/:filename',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { uploadId, filename } = request.params;
      if (!/^[a-f0-9-]+$/i.test(uploadId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid uploadId' });
      }

      const safeFilename = path.basename(filename);
      if (safeFilename.includes('..') || safeFilename.includes('/') || safeFilename.includes('\\')) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid filename' });
      }

      const filePath = path.join(config.tempDir, uploadId, safeFilename);
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }

      const targetDir = path.join(config.tempDir, uploadId);
      const remainingFiles = fs.existsSync(targetDir)
        ? fs.readdirSync(targetDir).map((fn) => ({
            filename: fn,
            size: fs.statSync(path.join(targetDir, fn)).size
          }))
        : [];

      return reply.send({
        uploadId,
        files: remainingFiles
      });
    }
  );

  // 5c. Delete entire temporary upload session (reset)
  fastify.delete<{ Params: { uploadId: string } }>(
    '/api/admin/upload-temp/:uploadId',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { uploadId } = request.params;
      if (!/^[a-f0-9-]+$/i.test(uploadId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid uploadId' });
      }

      const targetDir = path.join(config.tempDir, uploadId);
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      return reply.send({ success: true, message: 'Upload session cleaned up' });
    }
  );

  // 6. Inspect uploaded files
  fastify.post<{ Body: { uploadId?: string } }>(
    '/api/admin/inspect',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { uploadId } = request.body || {};
      if (!uploadId) {
        return reply.status(400).send({ error: 'Bad Request', message: 'uploadId required' });
      }

      // Security check on uploadId
      if (!/^[a-f0-9-]+$/i.test(uploadId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid uploadId' });
      }

      const targetDir = path.join(config.tempDir, uploadId);
      if (!fs.existsSync(targetDir)) {
        return reply.status(404).send({ error: 'Not Found', message: 'Upload session expired or not found' });
      }

      const inspection = inspectDirectoryOrZip(targetDir);
      return reply.send({
        uploadId,
        ...inspection
      });
    }
  );

  // 7. Validate cosmetic draft configuration & files
  fastify.post<{
    Body: {
      uploadId: string;
      id: string;
      name: string;
      category: string;
      slot?: string;
      version?: string;
      modelFile: string;
      textureFile: string;
      thumbnailFile?: string;
      isAnimated?: boolean;
      animationFile?: string;
      idleAnimation?: string;
      transform?: { translate_y?: number; scale?: number; static_lighting?: boolean };
    };
  }>(
    '/api/admin/validate',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const data = request.body;
      const errors: string[] = [];

      if (!data.uploadId) errors.push('uploadId is required');
      if (!data.id || !/^[a-z0-9_.-]+:[a-z0-9_.-]+$/.test(data.id.trim())) {
        errors.push("Invalid cosmetic ID format. Expected namespace format, e.g. 'cozmetics:blood_dragon_wings'");
      }
      if (!data.name || data.name.trim() === '') errors.push('Cosmetic display name is required');
      if (!data.category || !ALLOWED_CATEGORIES.has(data.category.toUpperCase())) {
        errors.push(`Invalid category. Allowed: ${Array.from(ALLOWED_CATEGORIES).join(', ')}`);
      }
      if (data.slot && !ALLOWED_SLOTS.has(data.slot.toUpperCase())) {
        errors.push(`Invalid equipment slot. Allowed: ${Array.from(ALLOWED_SLOTS).join(', ')}`);
      }

      const targetDir = path.join(config.tempDir, data.uploadId);
      if (!fs.existsSync(targetDir)) {
        return reply.status(404).send({ error: 'Not Found', message: 'Upload folder not found' });
      }

      // Check model file
      if (!data.modelFile) {
        errors.push('Model file must be specified');
      } else {
        const modelPath = path.join(targetDir, path.basename(data.modelFile));
        if (!fs.existsSync(modelPath)) {
          errors.push(`Model file '${data.modelFile}' not found in uploaded assets`);
        }
      }

      // Check texture file
      if (!data.textureFile) {
        errors.push('Texture file must be specified');
      } else {
        const texturePath = path.join(targetDir, path.basename(data.textureFile));
        if (!fs.existsSync(texturePath)) {
          errors.push(`Texture file '${data.textureFile}' not found in uploaded assets`);
        }
      }

      // Check animation file if animated
      if (data.isAnimated) {
        if (!data.animationFile) {
          errors.push('Animation file is required for animated cosmetics');
        } else {
          const animPath = path.join(targetDir, path.basename(data.animationFile));
          if (!fs.existsSync(animPath)) {
            errors.push(`Animation file '${data.animationFile}' not found in uploaded assets`);
          }
        }
      }

      // Check thumbnail
      if (data.thumbnailFile) {
        const thumbPath = path.join(targetDir, path.basename(data.thumbnailFile));
        if (!fs.existsSync(thumbPath)) {
          errors.push(`Thumbnail file '${data.thumbnailFile}' not found in uploaded assets`);
        }
      }

      const resolvedSlot = (data.slot || 'BODY').toUpperCase();
      const version = data.version?.trim() || '1.0.0';

      const manifestPreview: any = {
        id: data.id,
        version,
        model: path.basename(data.modelFile || 'model.geo.json'),
        texture: path.basename(data.textureFile || 'texture.webp'),
        slot: resolvedSlot,
        transform: {
          translate_y: data.transform?.translate_y ?? 0.0,
          scale: data.transform?.scale ?? 1.0,
          static_lighting: Boolean(data.transform?.static_lighting)
        }
      };

      if (data.isAnimated && data.animationFile) {
        manifestPreview.animation = path.basename(data.animationFile);
        if (data.idleAnimation) {
          manifestPreview.idle_animation = data.idleAnimation;
        }
      }

      if (errors.length > 0) {
        return reply.status(400).send({
          valid: false,
          errors,
          manifestPreview
        });
      }

      return reply.send({
        valid: true,
        errors: [],
        manifestPreview
      });
    }
  );

  // 8. Build package and save to draft or publish
  fastify.post<{
    Body: {
      uploadId: string;
      id: string;
      name: string;
      category: string;
      slot?: string;
      version?: string;
      description?: string;
      author?: string;
      modelFile: string;
      textureFile: string;
      thumbnailFile: string;
      isAnimated?: boolean;
      animationFile?: string;
      idleAnimation?: string;
      transform?: { translate_y?: number; scale?: number; static_lighting?: boolean };
      publishImmediately?: boolean;
    };
  }>(
    '/api/admin/packages',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const data = request.body;

      if (!data.uploadId || !data.id || !data.name || !data.category || !data.modelFile || !data.textureFile || !data.thumbnailFile) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Missing required fields (uploadId, id, name, category, modelFile, textureFile, thumbnailFile)'
        });
      }

      const targetDir = path.join(config.tempDir, data.uploadId);
      if (!fs.existsSync(targetDir)) {
        return reply.status(404).send({ error: 'Not Found', message: 'Upload folder not found or expired' });
      }

      const modelPath = path.join(targetDir, path.basename(data.modelFile));
      const texturePath = path.join(targetDir, path.basename(data.textureFile));
      const thumbPath = path.join(targetDir, path.basename(data.thumbnailFile));

      if (!fs.existsSync(modelPath) || !fs.existsSync(texturePath) || !fs.existsSync(thumbPath)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Specified model, texture, or thumbnail file not found on disk'
        });
      }

      const modelBuffer = fs.readFileSync(modelPath);
      const textureBuffer = fs.readFileSync(texturePath);

      let animData: { filename: string; buffer: Buffer; idleAnimation?: string } | undefined;
      if (data.isAnimated && data.animationFile) {
        const animPath = path.join(targetDir, path.basename(data.animationFile));
        if (fs.existsSync(animPath)) {
          animData = {
            filename: path.basename(data.animationFile),
            buffer: fs.readFileSync(animPath),
            idleAnimation: data.idleAnimation
          };
        }
      }

      const version = data.version?.trim() || '1.0.0';
      const slot = (data.slot || 'BODY').toUpperCase();

      // Build deterministically
      const buildResult = await buildCosmeticPackage({
        id: data.id,
        version,
        slot,
        transform: data.transform,
        model: { filename: path.basename(data.modelFile), buffer: modelBuffer },
        texture: { filename: path.basename(data.textureFile), buffer: textureBuffer },
        animation: animData
      });

      // Save ZIP to packages directory
      const sanitizedId = data.id.replace(':', '_').replace(/[^a-zA-Z0-9._-]/g, '_');
      const packageFilename = `${sanitizedId}-${version}.zip`;
      const packageFilePath = path.join(config.packagesDir, packageFilename);
      fs.mkdirSync(config.packagesDir, { recursive: true });
      fs.writeFileSync(packageFilePath, buildResult.zipBuffer);

      // Save thumbnail to thumbnails directory
      const thumbExt = path.extname(data.thumbnailFile).toLowerCase();
      const thumbFilename = `${sanitizedId}${thumbExt}`;
      const thumbDestPath = path.join(config.thumbnailsDir, thumbFilename);
      fs.mkdirSync(config.thumbnailsDir, { recursive: true });
      fs.copyFileSync(thumbPath, thumbDestPath);

      const status = data.publishImmediately ? 'published' : 'draft';
      const now = Date.now();

      const record: CosmeticRecord = {
        id: data.id,
        name: data.name.trim(),
        category: data.category.toUpperCase(),
        slot,
        version,
        hash: buildResult.hash,
        package_filename: packageFilename,
        thumbnail_filename: thumbFilename,
        description: data.description?.trim() || '',
        author: data.author?.trim() || 'Cozmetics Official',
        is_animated: data.isAnimated ? 1 : 0,
        model_filename: path.basename(data.modelFile),
        texture_filename: path.basename(data.textureFile),
        animation_filename: data.animationFile ? path.basename(data.animationFile) : null,
        idle_animation: data.idleAnimation || null,
        translate_y: data.transform?.translate_y ?? 0.0,
        scale: data.transform?.scale ?? 1.0,
        static_lighting: data.transform?.static_lighting ? 1 : 0,
        status,
        created_at: now,
        updated_at: now
      };

      repo.saveCosmetic(record);

      // Clean up temp dir
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
      } catch {}

      return reply.send({
        success: true,
        id: record.id,
        version: record.version,
        hash: record.hash,
        status: record.status,
        packageFilename,
        thumbnailFilename: thumbFilename,
        manifest: buildResult.manifestObj
      });
    }
  );

  // 9. Publish package
  fastify.post<{ Params: { id: string } }>(
    '/api/admin/packages/:id/publish',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = request.params.id;
      const item = repo.getCosmeticById(id);
      if (!item) {
        return reply.status(404).send({ error: 'Not Found', message: `Cosmetic '${id}' not found` });
      }

      repo.updateCosmeticStatus(id, 'published');
      return reply.send({
        success: true,
        id,
        status: 'published',
        revision: repo.getRevision()
      });
    }
  );

  // 10. Unpublish package
  fastify.post<{ Params: { id: string } }>(
    '/api/admin/packages/:id/unpublish',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = request.params.id;
      const item = repo.getCosmeticById(id);
      if (!item) {
        return reply.status(404).send({ error: 'Not Found', message: `Cosmetic '${id}' not found` });
      }

      repo.updateCosmeticStatus(id, 'unpublished');
      return reply.send({
        success: true,
        id,
        status: 'unpublished',
        revision: repo.getRevision()
      });
    }
  );

  // 11. Delete package completely
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/packages/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = request.params.id;
      const item = repo.getCosmeticById(id);
      if (!item) {
        return reply.status(404).send({ error: 'Not Found', message: `Cosmetic '${id}' not found` });
      }

      // Delete package file and thumbnail
      const pkgPath = path.join(config.packagesDir, item.package_filename);
      const thumbPath = path.join(config.thumbnailsDir, item.thumbnail_filename);
      fs.rmSync(pkgPath, { force: true });
      fs.rmSync(thumbPath, { force: true });

      repo.deleteCosmetic(id);
      return reply.send({
        success: true,
        id,
        message: `Cosmetic '${id}' deleted successfully`,
        revision: repo.getRevision()
      });
    }
  );
}
