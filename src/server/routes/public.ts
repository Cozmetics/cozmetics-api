import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { Repository } from '../db/repository.js';
import { AppConfig } from '../config.js';

export function registerPublicRoutes(fastify: FastifyInstance, repo: Repository, config: AppConfig) {
  // Service health
  fastify.get('/api/health', async () => {
    return {
      status: 'ok',
      service: 'Cozmetics Publishing Service',
      version: '1.0.0',
      timestamp: Date.now(),
      revision: repo.getRevision(),
      publishedCount: repo.getPublishedCosmetics().length
    };
  });

  // Helper to format catalogue response
  const handleCatalogRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const revision = repo.getRevision();
    const etag = `W/"rev-${revision}"`;

    if (request.headers['if-none-match'] === etag) {
      return reply.status(304).send();
    }

    const host = request.headers.host || `localhost:${config.port}`;
    const proto = request.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : (config.isProduction ? 'https' : 'http'));
    const effectiveBaseUrl = (host.includes('localhost') || host.includes('127.0.0.1'))
      ? `${proto}://${host}`
      : config.baseUrl;

    const published = repo.getPublishedCosmetics();

    const cosmetics = published.map((item) => {
      const packageUrl = `${effectiveBaseUrl}/api/packages/${encodeURIComponent(item.id)}/${encodeURIComponent(item.version)}`;
      const thumbnailUrl = `${effectiveBaseUrl}/api/thumbnails/${encodeURIComponent(item.thumbnail_filename)}`;

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        slot: item.slot,
        version: item.version,
        hash: item.hash,
        package_url: packageUrl,
        thumbnail_url: thumbnailUrl,
        description: item.description,
        author: item.author,
        transform: {
          translate_y: item.translate_y,
          scale: item.scale,
          static_lighting: Boolean(item.static_lighting)
        }
      };
    });

    reply.header('ETag', etag);
    reply.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    return reply.send({
      revision,
      cosmetics
    });
  };

  // Primary catalogue route
  fastify.get('/api/catalog', handleCatalogRequest);

  // Mod compatibility routes (so HttpCosmeticsClient and legacy config URLs work seamlessly)
  fastify.get('/mod/catalogue', handleCatalogRequest);
  fastify.get('/api/mod/catalogue', handleCatalogRequest);
  fastify.get('/api/v1/mod/catalogue', handleCatalogRequest);

  // Single item details
  fastify.get<{ Params: { id: string } }>('/api/catalog/:id', async (request, reply) => {
    const item = repo.getCosmeticById(request.params.id);
    if (!item || item.status !== 'published') {
      return reply.status(404).send({ error: 'Not Found', message: `Cosmetic '${request.params.id}' not found` });
    }

    const host = request.headers.host || `localhost:${config.port}`;
    const proto = request.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : (config.isProduction ? 'https' : 'http'));
    const effectiveBaseUrl = (host.includes('localhost') || host.includes('127.0.0.1'))
      ? `${proto}://${host}`
      : config.baseUrl;

    return reply.send({
      id: item.id,
      name: item.name,
      category: item.category,
      slot: item.slot,
      version: item.version,
      hash: item.hash,
      package_url: `${effectiveBaseUrl}/api/packages/${encodeURIComponent(item.id)}/${encodeURIComponent(item.version)}`,
      thumbnail_url: `${effectiveBaseUrl}/api/thumbnails/${encodeURIComponent(item.thumbnail_filename)}`,
      description: item.description,
      author: item.author,
      transform: {
        translate_y: item.translate_y,
        scale: item.scale,
        static_lighting: Boolean(item.static_lighting)
      }
    });
  });

  // Package download endpoint
  fastify.get<{ Params: { id: string; version: string } }>(
    '/api/packages/:id/:version',
    async (request, reply) => {
      const { id, version } = request.params;
      const item = repo.getCosmeticById(id);

      if (!item) {
        return reply.status(404).send({ error: 'Not Found', message: `Cosmetic '${id}' not found` });
      }

      if (item.version !== version) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Version '${version}' not found for cosmetic '${id}' (available: ${item.version})`
        });
      }

      const filePath = path.join(config.packagesDir, item.package_filename);
      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'Not Found', message: 'Package file not found on disk' });
      }

      const etag = `"${item.hash}"`;
      if (request.headers['if-none-match'] === etag) {
        return reply.status(304).send();
      }

      const stream = fs.createReadStream(filePath);
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${path.basename(item.package_filename)}"`);
      reply.header('X-Package-SHA256', item.hash);
      reply.header('ETag', etag);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');

      return reply.send(stream);
    }
  );

  // Static thumbnail delivery
  fastify.get<{ Params: { filename: string } }>(
    '/api/thumbnails/:filename',
    async (request, reply) => {
      const filename = path.basename(request.params.filename); // Protect against path traversal

      // Security check
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid thumbnail filename' });
      }

      const filePath = path.join(config.thumbnailsDir, filename);
      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'Not Found', message: 'Thumbnail not found' });
      }

      const ext = path.extname(filename).toLowerCase();
      const MIME_MAP: Record<string, string> = {
        '.png': 'image/png',
        '.apng': 'image/apng',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.bmp': 'image/bmp',
        '.tif': 'image/tiff',
        '.tiff': 'image/tiff'
      };
      const contentType = MIME_MAP[ext] || 'application/octet-stream';

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.send(fs.createReadStream(filePath));
    }
  );

  // Mod account linking mock/stubs for non-blocking client compatibility
  const linkHandler = async () => {
    return {
      code: 'MC-FREE-DEMO',
      expiresInSeconds: 600,
      verificationUrl: '/link?code=MC-FREE-DEMO'
    };
  };
  fastify.post('/mod/link/code', linkHandler);
  fastify.post('/api/v1/mod/link/code', linkHandler);

  const statusHandler = async () => ({ status: 'CONFIRMED' });
  fastify.get('/mod/link/status', statusHandler);
  fastify.get('/api/v1/mod/link/status', statusHandler);

  const equippedHandler = async () => ({ equipped: {} });
  fastify.get('/mod/players/:uuid/equipped', equippedHandler);
  fastify.get('/api/v1/mod/players/:uuid/equipped', equippedHandler);
}
