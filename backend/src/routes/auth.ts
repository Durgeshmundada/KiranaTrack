import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

import { env } from '../config/env';
import { recordAuthFailureMetric } from '../observability/metrics';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError, parseBody, sendCreated, sendOk } from '../utils/http';
import { authCredentialsSchema } from '../validators/schemas';

const AUTH_ROUTE_TIMEOUT_MS = Math.max(3000, env.AUTH_UPSTREAM_TIMEOUT_MS);
const AUTH_UPSTREAM_MAX_ATTEMPTS = env.AUTH_UPSTREAM_RETRIES + 1;
const retryableUpstreamStatusCodes = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const fetchWithTimeout: typeof fetch = async (input, init = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_ROUTE_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const supabaseAuthClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});

type AuthSessionPayload = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: number | null;
  user: {
    id: string;
    email: string | null;
  };
};

type SupabaseResultLike = {
  data: unknown;
  error: {
    message?: string;
    status?: number;
  } | null;
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableUpstreamError = (
  error: SupabaseResultLike['error'],
): boolean => {
  if (!error) {
    return false;
  }

  if (
    typeof error.status === 'number' &&
    retryableUpstreamStatusCodes.has(error.status)
  ) {
    return true;
  }

  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('abort')
  );
};

const isUnavailableUpstreamError = (
  error: SupabaseResultLike['error'],
): boolean => {
  if (!error) {
    return false;
  }

  if (typeof error.status === 'number' && error.status >= 500) {
    return true;
  }

  return isRetryableUpstreamError(error);
};

const toAuthSessionPayload = (authData: {
  session: {
    access_token: string;
    refresh_token: string;
    token_type?: string;
    expires_at?: number;
    user?: { id: string; email?: string | null } | null;
  };
}): AuthSessionPayload => {
  const user = authData.session.user;

  return {
    accessToken: authData.session.access_token,
    refreshToken: authData.session.refresh_token,
    tokenType: authData.session.token_type ?? 'bearer',
    expiresAt: authData.session.expires_at ?? null,
    user: {
      id: user?.id ?? '',
      email: user?.email ?? null,
    },
  };
};

const runSupabaseAuthResultCall = async <T extends SupabaseResultLike>(
  fn: () => Promise<T>,
): Promise<T> => {
  let lastResult: T | null = null;

  for (let attempt = 1; attempt <= AUTH_UPSTREAM_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await fn();
      lastResult = result;

      if (!isRetryableUpstreamError(result.error) || attempt >= AUTH_UPSTREAM_MAX_ATTEMPTS) {
        return result;
      }
    } catch {
      if (attempt >= AUTH_UPSTREAM_MAX_ATTEMPTS) {
        throw new HttpError(503, 'Authentication service unavailable. Please try again.');
      }
    }

    await wait(env.AUTH_UPSTREAM_RETRY_DELAY_MS * attempt);
  }

  throw new HttpError(503, 'Authentication service unavailable. Please try again.');
};

const normalizeAuthFailureStatus = (
  error: SupabaseResultLike['error'],
  fallbackStatus: number,
): number => {
  if (!error) {
    return fallbackStatus;
  }

  if (isUnavailableUpstreamError(error)) {
    return 503;
  }

  return fallbackStatus;
};

const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const payload = parseBody(authCredentialsSchema, req.body);
    const email = payload.email.trim().toLowerCase();

    const signIn = await runSupabaseAuthResultCall(() =>
      supabaseAuthClient.auth.signInWithPassword({
        email,
        password: payload.password,
      }),
    );

    if (signIn.error || !signIn.data.session?.access_token || !signIn.data.session?.refresh_token) {
      recordAuthFailureMetric(signIn.error ? 'login_invalid_credentials_or_upstream' : 'login_missing_session');
      throw new HttpError(
        normalizeAuthFailureStatus(signIn.error, 401),
        signIn.error?.message ?? 'Invalid email or password',
      );
    }

    sendOk(
      res,
      toAuthSessionPayload({
        session: {
          access_token: signIn.data.session.access_token,
          refresh_token: signIn.data.session.refresh_token,
          token_type: signIn.data.session.token_type,
          expires_at: signIn.data.session.expires_at,
          user: signIn.data.user,
        },
      }),
    );
  }),
);

authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
    if (!env.AUTH_SIGNUP_ENABLED) {
      throw new HttpError(403, 'Sign-up is disabled');
    }

    const payload = parseBody(authCredentialsSchema, req.body);
    const email = payload.email.trim().toLowerCase();

    const created = await runSupabaseAuthResultCall(() =>
      supabaseAuthClient.auth.admin.createUser({
        email,
        password: payload.password,
        email_confirm: true,
      }),
    );

    if (created.error) {
      recordAuthFailureMetric('signup_create_user_error');
      const errorMessage = created.error.message ?? 'Unable to create account';
      const conflictDetected =
        errorMessage.toLowerCase().includes('already') ||
        errorMessage.toLowerCase().includes('exists');
      if (!conflictDetected) {
        throw new HttpError(
          normalizeAuthFailureStatus(created.error, 400),
          errorMessage,
        );
      }
    }

    const signIn = await runSupabaseAuthResultCall(() =>
      supabaseAuthClient.auth.signInWithPassword({
        email,
        password: payload.password,
      }),
    );

    if (signIn.error || !signIn.data.session?.access_token || !signIn.data.session?.refresh_token) {
      recordAuthFailureMetric('signup_signin_failed');
      throw new HttpError(
        normalizeAuthFailureStatus(signIn.error, 400),
        signIn.error?.message ?? 'Unable to sign in after account creation',
      );
    }

    sendCreated(
      res,
      toAuthSessionPayload({
        session: {
          access_token: signIn.data.session.access_token,
          refresh_token: signIn.data.session.refresh_token,
          token_type: signIn.data.session.token_type,
          expires_at: signIn.data.session.expires_at,
          user: signIn.data.user,
        },
      }),
    );
  }),
);

export { authRouter };
