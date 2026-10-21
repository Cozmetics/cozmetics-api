import fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { AppConfig } from './config.js';
import { initDatabase } from './db/schema.js';
import { Repository } from './db/repository.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerAdminRoutes } from './routes/admin.js';

export async function createServer(config: AppConfig): Promise<{ app: FastifyInstance; repo: Repository }> {
  const app = fastify({
    logger: {
      level: config.isProduction ? 'info' : 'debug'
    },
    bodyLimit: 25 * 1024 * 1024 // 25 MB max body size
  });

  // Database initialization
  const db = initDatabase(config.dbPath);
  const repo = new Repository(db);

  // Register cookie support
  await app.register(fastifyCookie, {
    secret: config.sessionSecret
  });

  // Register global rate limiter
  await app.register(fastifyRateLimit, {
    global: false // Apply explicitly per-route
  });

  // Register multipart support for file uploads
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20 MB max file
      files: 10
    }
  });

  // Register API routes
  registerPublicRoutes(app, repo, config);
  registerAdminRoutes(app, repo, config);

  // Serve Single-Page App (SPA) if compiled public directory exists
  const publicDir = path.resolve(process.cwd(), 'dist', 'public');
  if (fs.existsSync(publicDir)) {
    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: '/'
    });

    // SPA fallback: any non-API route returns index.html
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/mod')) {
        return reply.status(404).send({ error: 'Not Found', message: `Route ${request.method} ${request.url} not found` });
      }
      return reply.sendFile('index.html', publicDir);
    });
  } else {
    // Development fallback when frontend is not yet built
    app.get('/', async (_request, reply) => {
      reply.type('text/html');
      return `
        <!DOCTYPE html>
        <html>
          <head><title>Cozmetics Studio</title></head>
          <body style="background:#111;color:#eee;font-family:sans-serif;padding:2rem;">
            <h1>Cozmetics Publishing API</h1>
            <p>Single-page admin website is compiling or running in Vite dev mode.</p>
            <p>API endpoints available under <code>/api/</code>.</p>
          </body>
        </html>
      `;
    });
  }

  return { app, repo };
}

