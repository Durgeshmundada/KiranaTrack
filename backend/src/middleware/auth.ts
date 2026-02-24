import type { NextFunction, Request, Response } from 'express';
import { createSecretKey } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

import { env } from '../config/env';
import { HttpError } from '../utils/http';

const AUTH_UPSTREAM_TIMEOUT_MS = env.AUTH_UPSTREAM_TIMEOUT_MS;
const AUTH_CACHE_TTL_MS = env.AUTH_CACHE_TTL_MS;
const MAX_AUTH_CACHE_SIZE = 2_000;
const jwtSecretKey = env.SUPABASE_JWT_SECRET
  ? createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET, 'utf8'))
  : null;

const fetchWithTimeout: typeof fetch = async (input, init = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_UPSTREAM_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});
const authTokenCache = new Map<string, number>();
const inFlightTokenChecks = new Map<string, Promise<boolean>>();

const isAllowedRole = (role: unknown): boolean =>
  role === null || role === 'authenticated' || role === 'service_role';

const extractBearerToken = (authorizationHeader?: string): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token?.trim()) {
    return null;
  }

  return token.trim();
};

const pruneExpiredAuthCacheEntries = (): void => {
  if (authTokenCache.size < MAX_AUTH_CACHE_SIZE) {
    return;
  }

  const now = Date.now();
  authTokenCache.forEach((expiresAt, token) => {
    if (expiresAt <= now) {
      authTokenCache.delete(token);
    }
  });
};

const isTokenValidWithLocalSecret = async (token: string): Promise<boolean> => {
  if (!jwtSecretKey) {
    return false;
  }

  try {
    const { payload } = await jwtVerify(token, jwtSecretKey, {
      algorithms: ['HS256'],
    });

    return isAllowedRole((payload as { role?: unknown }).role ?? null);
  } catch {
    return false;
  }
};

const isTokenValid = async (token: string): Promise<boolean> => {
  const now = Date.now();
  const cachedUntil = authTokenCache.get(token);
  if (cachedUntil && cachedUntil > now) {
    return true;
  }
  if (cachedUntil) {
    authTokenCache.delete(token);
  }

  const inFlight = inFlightTokenChecks.get(token);
  if (inFlight) {
    return inFlight;
  }

  const checkPromise = (async () => {
    let valid = false;

    if (jwtSecretKey) {
      valid = await isTokenValidWithLocalSecret(token);
    } else {
      const { data, error } = await supabaseAdmin.auth.getClaims(token);
      const roleClaim = typeof data?.claims?.role === 'string' ? data.claims.role : null;
      valid = !(error || !data?.claims || !isAllowedRole(roleClaim));
    }

    if (valid) {
      authTokenCache.set(token, Date.now() + AUTH_CACHE_TTL_MS);
      pruneExpiredAuthCacheEntries();
    }

    return valid;
  })().finally(() => {
    inFlightTokenChecks.delete(token);
  });

  inFlightTokenChecks.set(token, checkPromise);
  return checkPromise;
};

export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.method === 'OPTIONS' || !req.path.startsWith('/api/')) {
    next();
    return;
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    next(new HttpError(401, 'Authentication required'));
    return;
  }

  void (async () => {
    try {
      const valid = await isTokenValid(token);
      if (!valid) {
        next(new HttpError(401, 'Invalid or expired token'));
        return;
      }

      next();
    } catch {
      next(new HttpError(401, 'Invalid or expired token'));
    }
  })();
};
