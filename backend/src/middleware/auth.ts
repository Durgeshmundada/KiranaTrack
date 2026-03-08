import type { NextFunction, Request, Response } from 'express';
import { createHash, createSecretKey } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '../config/env';
import { logError, logWarn } from '../observability/logger';
import { recordAuthFailureMetric } from '../observability/metrics';
import { HttpError } from '../utils/http';

const AUTH_UPSTREAM_TIMEOUT_MS = env.AUTH_UPSTREAM_TIMEOUT_MS;
const AUTH_CACHE_TTL_MS = env.AUTH_CACHE_TTL_MS;
const MAX_AUTH_CACHE_SIZE = 2_000;
const jwtSecretKey = env.SUPABASE_JWT_SECRET
  ? createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET, 'utf8'))
  : null;
const normalizedSupabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');
const supabaseIssuer = `${normalizedSupabaseUrl}/auth/v1`;
const remoteJwks = createRemoteJWKSet(new URL(`${supabaseIssuer}/.well-known/jwks.json`));
type AllowedRole = 'authenticated';
type VerifiedTokenClaims = {
  userId: string;
  role: AllowedRole;
};
type AuthenticatedRequest = Request & {
  authUserId?: string;
  authRole?: AllowedRole;
};

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
const authTokenCache = new Map<string, { expiresAt: number; claims: VerifiedTokenClaims }>();
const inFlightTokenChecks = new Map<string, Promise<VerifiedTokenClaims | null>>();

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const isAllowedRole = (role: unknown): boolean =>
  role === 'authenticated';

const toVerifiedClaims = (claims: {
  sub?: unknown;
  role?: unknown;
} | null | undefined): VerifiedTokenClaims | null => {
  const subject = claims?.sub;
  const role = claims?.role;
  if (typeof subject !== 'string' || subject.length === 0 || !isAllowedRole(role)) {
    return null;
  }

  const allowedRole = role as AllowedRole;
  return {
    userId: subject,
    role: allowedRole,
  };
};

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
  authTokenCache.forEach((entry, token) => {
    if (entry.expiresAt <= now) {
      authTokenCache.delete(token);
    }
  });
};

const getTokenClaimsWithLocalSecret = async (
  token: string,
): Promise<VerifiedTokenClaims | null> => {
  if (!jwtSecretKey) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, jwtSecretKey, {
      algorithms: ['HS256'],
      audience: 'authenticated',
    });

    return toVerifiedClaims({
      sub: payload.sub,
      role: (payload as { role?: unknown }).role,
    });
  } catch {
    return null;
  }
};

const getTokenClaimsWithRemoteJwks = async (
  token: string,
): Promise<VerifiedTokenClaims | null> => {
  try {
    const { payload } = await jwtVerify(token, remoteJwks, {
      issuer: supabaseIssuer,
      audience: 'authenticated',
    });

    return toVerifiedClaims({
      sub: payload.sub,
      role: (payload as { role?: unknown }).role,
    });
  } catch {
    return null;
  }
};

const getTokenClaims = async (token: string): Promise<VerifiedTokenClaims | null> => {
  const cacheKey = hashToken(token);
  const now = Date.now();
  const cached = authTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.claims;
  }
  if (cached) {
    authTokenCache.delete(cacheKey);
  }

  const inFlight = inFlightTokenChecks.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const checkPromise = (async () => {
    let claims = await getTokenClaimsWithLocalSecret(token);

    if (!claims) {
      claims = await getTokenClaimsWithRemoteJwks(token);
    }

    if (!claims) {
      const { data, error } = await supabaseAdmin.auth.getClaims(token);
      claims = error
        ? null
        : toVerifiedClaims({
            sub: data?.claims?.sub,
            role: data?.claims?.role,
          });
    }

    if (claims) {
      authTokenCache.set(cacheKey, {
        expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
        claims,
      });
      pruneExpiredAuthCacheEntries();
    }

    return claims;
  })().finally(() => {
    inFlightTokenChecks.delete(cacheKey);
  });

  inFlightTokenChecks.set(cacheKey, checkPromise);
  return checkPromise;
};

export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.method === 'OPTIONS' || !req.path.startsWith('/api/')) {
    next();
    return;
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    recordAuthFailureMetric('missing_bearer_token');
    next(new HttpError(401, 'Authentication required'));
    return;
  }

  void (async () => {
    try {
      const claims = await getTokenClaims(token);
      if (!claims) {
        recordAuthFailureMetric('invalid_or_expired_token');
        next(new HttpError(401, 'Invalid or expired token'));
        return;
      }

      const request = req as AuthenticatedRequest;
      request.authUserId = claims.userId;
      request.authRole = claims.role;

      next();
    } catch (error) {
      recordAuthFailureMetric('auth_verification_exception');
      logWarn('auth.verification_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      next(new HttpError(401, 'Invalid or expired token'));
    }
  })();
};
