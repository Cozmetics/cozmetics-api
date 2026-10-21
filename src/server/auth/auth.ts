import crypto from 'node:crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Repository } from '../db/repository.js';

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return {
    hash: derivedKey.toString('hex'),
    salt
  };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const keyBuffer = Buffer.from(hash, 'hex');
    if (derivedKey.length !== keyBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface AuthenticatedAdmin {
  id: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: AuthenticatedAdmin;
  }
}

export function createAuthMiddleware(repo: Repository) {
  return async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    let token: string | undefined;

    // Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    // Check cookie
    if (!token && request.cookies?.cozmetics_session) {
      token = request.cookies.cozmetics_session;
    }

    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Admin authentication required' });
    }

    const session = repo.getSession(token);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Session expired or invalid' });
    }

    request.admin = {
      id: session.admin_id,
      username: session.username
    };
  };
}

export { SESSION_TTL_MS };

