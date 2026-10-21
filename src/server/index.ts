import fs from 'node:fs';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

async function bootstrap() {
  const config = loadConfig();

  // Ensure persistent directories exist
  fs.mkdirSync(config.packagesDir, { recursive: true });
  fs.mkdirSync(config.thumbnailsDir, { recursive: true });
  fs.mkdirSync(config.tempDir, { recursive: true });

  const { app, repo } = await createServer(config);

  // Check if first admin exists; if not, print helpful reminder
  const adminCount = repo.countAdmins();
  if (adminCount === 0) {
    console.warn('\n[!] Notice: No admin accounts found in database.');
    console.warn('    Create your first admin account by running:');
    console.warn('    npm run create-admin -- --username <username> --password <password>\n');
  }

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`\n======================================================`);
    console.log(`  ✦ Cozmetics Publishing Service & Studio running`);
    console.log(`  Local URL:     http://localhost:${config.port}`);
    console.log(`  Target Domain: ${config.baseUrl}`);
    console.log(`  Data Storage:  ${config.dataDir}`);
    console.log(`  API Health:    http://localhost:${config.port}/api/health`);
    console.log(`  Catalogue:     http://localhost:${config.port}/api/catalog`);
    console.log(`======================================================\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});

