import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError, parseBody, sendCreated, sendOk } from '../utils/http';
import { authCredentialsSchema } from '../validators/schemas';

const AUTH_ROUTE_TIMEOUT_MS = Math.max(8000, env.AUTH_UPSTREAM_TIMEOUT_MS);

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

const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const payload = parseBody(authCredentialsSchema, req.body);
    const email = payload.email.trim().toLowerCase();

    const signIn = await supabaseAuthClient.auth.signInWithPassword({
      email,
      password: payload.password,
    });

    if (signIn.error || !signIn.data.session?.access_token || !signIn.data.session?.refresh_token) {
      throw new HttpError(401, signIn.error?.message ?? 'Invalid email or password');
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
    const payload = parseBody(authCredentialsSchema, req.body);
    const email = payload.email.trim().toLowerCase();

    const created = await supabaseAuthClient.auth.admin.createUser({
      email,
      password: payload.password,
      email_confirm: true,
    });

    if (created.error) {
      const errorMessage = created.error.message ?? 'Unable to create account';
      const conflictDetected =
        errorMessage.toLowerCase().includes('already') ||
        errorMessage.toLowerCase().includes('exists');
      if (!conflictDetected) {
        throw new HttpError(400, errorMessage);
      }
    }

    const signIn = await supabaseAuthClient.auth.signInWithPassword({
      email,
      password: payload.password,
    });

    if (signIn.error || !signIn.data.session?.access_token || !signIn.data.session?.refresh_token) {
      throw new HttpError(400, signIn.error?.message ?? 'Unable to sign in after account creation');
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
