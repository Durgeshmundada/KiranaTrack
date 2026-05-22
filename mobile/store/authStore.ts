import type { Session, User } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { create } from 'zustand';

import { type BackendAuthSession, signInWithBackend, signUpWithBackend } from '@/services/backendAuth';
import { setManualAccessToken } from '@/services/backendClient';
import {
  getSessionStorageItem,
  removeSessionStorageItem,
  setSessionStorageItem,
} from '@/services/sessionStorage';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';

interface AuthState {
  ready: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const BACKEND_SESSION_STORAGE_KEY = 'kiranatrack_backend_session';
const SUPABASE_AUTH_TIMEOUT_MS = 9000;

let initialized = false;
let listenerBound = false;

const toPseudoSession = (payload: BackendAuthSession): Session => {
  const expiresAt = payload.expiresAt ?? Math.floor(Date.now() / 1000) + 3600;
  const expiresIn = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
  const userId = payload.user.id || `unknown-${Date.now()}`;

  const user: User = {
    id: userId,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: payload.user.email ?? null,
  } as User;

  return {
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
    token_type: payload.tokenType || 'bearer',
    expires_at: expiresAt,
    expires_in: expiresIn,
    user,
  } as Session;
};

const persistBackendSession = async (
  payload: BackendAuthSession | null,
): Promise<void> => {
  if (!payload) {
    await removeSessionStorageItem(BACKEND_SESSION_STORAGE_KEY);
    return;
  }

  await setSessionStorageItem(
    BACKEND_SESSION_STORAGE_KEY,
    JSON.stringify(payload),
  );
};

const readPersistedBackendSession = async (): Promise<BackendAuthSession | null> => {
  const raw = await getSessionStorageItem(BACKEND_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as BackendAuthSession;
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.tokenType !== 'string' ||
      !parsed.user ||
      typeof parsed.user.id !== 'string'
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const isBackendSessionExpired = (session: BackendAuthSession): boolean => {
  if (!session.expiresAt) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  return session.expiresAt <= now + 30;
};

const clearPersistedBackendSession = async (): Promise<void> => {
  await persistBackendSession(null).catch(() => {});
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const shouldFallbackToBackendAuth = (error: unknown): boolean => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;

  if (typeof status === 'number') {
    if (status >= 500 || status === 408 || status === 429) {
      return true;
    }
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (
      normalized.includes('timed out') ||
      normalized.includes('timeout') ||
      normalized.includes('network') ||
      normalized.includes('failed to fetch') ||
      normalized.includes('fetch failed') ||
      normalized.includes('internet')
    ) {
      return true;
    }
  }

  return true;
};

const isInvalidRefreshTokenError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalized = error.message.toLowerCase();
  return (
    normalized.includes('invalid refresh token') ||
    normalized.includes('refresh token not found') ||
    normalized.includes('already used')
  );
};

const clearStaleSupabaseSession = async (): Promise<void> => {
  setManualAccessToken(null, null);
  if (isSupabaseConfigured) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }
};

const applyPersistedBackendSession = async (
  backendSession: BackendAuthSession,
  set: (partial: Partial<AuthState>) => void,
): Promise<void> => {
  if (isBackendSessionExpired(backendSession)) {
    await clearPersistedBackendSession();
    return;
  }

  const session = toPseudoSession(backendSession);
  setManualAccessToken(backendSession.accessToken, backendSession.refreshToken);
  set({
    session,
    user: session.user,
    ready: true,
  });

  if (isSupabaseConfigured) {
    await supabase.auth
      .setSession({
        access_token: backendSession.accessToken,
        refresh_token: backendSession.refreshToken,
      })
      .catch(() => {});
  }
};

const applySupabaseSession = async (
  session: Session | null,
  set: (partial: Partial<AuthState>) => void,
): Promise<void> => {
  setManualAccessToken(
    session?.access_token ?? null,
    session?.refresh_token ?? null,
  );
  await clearPersistedBackendSession();
  set({
    session,
    user: session?.user ?? null,
    ready: true,
  });
};

export const useAuthStore = create<AuthState>()((set) => ({
  ready: false,
  loading: false,
  session: null,
  user: null,

  initialize: async () => {
    if (initialized) {
      return;
    }

    initialized = true;
    setManualAccessToken(null, null);

    if (!isSupabaseConfigured) {
      const persistedBackendSession = await readPersistedBackendSession();
      if (persistedBackendSession) {
        await applyPersistedBackendSession(persistedBackendSession, set);
        return;
      }

      set({
        session: null,
        user: null,
        ready: true,
      });
      return;
    }

    let data: Awaited<ReturnType<typeof supabase.auth.getSession>>['data'] | null = null;
    let error: unknown = null;

    try {
      const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        SUPABASE_AUTH_TIMEOUT_MS,
        'Session check timed out. Please retry.',
      );
      data = sessionResult.data;
      error = sessionResult.error;
    } catch (sessionError) {
      error = sessionError;
    }

    if (isInvalidRefreshTokenError(error)) {
      await clearStaleSupabaseSession();
      error = null;
      data = null;
    }

    const activeSupabaseSession = error ? null : (data?.session ?? null);
    if (activeSupabaseSession) {
      await applySupabaseSession(activeSupabaseSession, set);
    } else {
      const persistedBackendSession = await readPersistedBackendSession();
      if (persistedBackendSession) {
        await applyPersistedBackendSession(persistedBackendSession, set);
      } else {
        set({
          session: null,
          user: null,
          ready: true,
        });
      }
    }

    if (!listenerBound) {
      listenerBound = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
          ready: true,
        });
        setManualAccessToken(
          session?.access_token ?? null,
          session?.refresh_token ?? null,
        );

        if (!session) {
          void clearPersistedBackendSession();
        }
      });
    }
  },

  signIn: async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    set({ loading: true });

    try {
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await withTimeout(
            supabase.auth.signInWithPassword({
              email: normalizedEmail,
              password,
            }),
            SUPABASE_AUTH_TIMEOUT_MS,
            'Sign-in timed out. Please check internet and retry.',
          );

          if (error || !data.session) {
            throw error ?? new Error('Authentication failed');
          }

          await applySupabaseSession(data.session, set);
          return;
        } catch (supabaseError) {
          if (!shouldFallbackToBackendAuth(supabaseError)) {
            if (isInvalidRefreshTokenError(supabaseError)) {
              await clearStaleSupabaseSession();
            }
            throw supabaseError;
          }
          // Fall back to backend-auth bridge only when direct Supabase sign-in fails.
        }
      }

      const backendSession = await signInWithBackend(normalizedEmail, password);
      const session = toPseudoSession(backendSession);
      setManualAccessToken(
        backendSession.accessToken,
        backendSession.refreshToken,
      );
      await persistBackendSession(backendSession).catch(() => {});
      set({
        session,
        user: session.user,
        ready: true,
      });

      if (isSupabaseConfigured) {
        await supabase.auth
          .setSession({
            access_token: backendSession.accessToken,
            refresh_token: backendSession.refreshToken,
          })
          .catch(() => {});
      }
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    set({ loading: true });

    try {
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await withTimeout(
            supabase.auth.signUp({
              email: normalizedEmail,
              password,
            }),
            SUPABASE_AUTH_TIMEOUT_MS,
            'Sign-up timed out. Please check internet and retry.',
          );

          if (error) {
            throw error;
          }

          await applySupabaseSession(data.session, set);
          return;
        } catch (supabaseError) {
          if (!shouldFallbackToBackendAuth(supabaseError)) {
            throw supabaseError;
          }
          // Fall back to backend-auth bridge only when direct Supabase sign-up fails.
        }
      }

      const backendSession = await signUpWithBackend(normalizedEmail, password);
      const session = toPseudoSession(backendSession);
      setManualAccessToken(
        backendSession.accessToken,
        backendSession.refreshToken,
      );
      await persistBackendSession(backendSession).catch(() => {});
      set({
        session,
        user: session.user,
        ready: true,
      });

      if (isSupabaseConfigured) {
        await supabase.auth
          .setSession({
            access_token: backendSession.accessToken,
            refresh_token: backendSession.refreshToken,
          })
          .catch(() => {});
      }
    } finally {
      set({ loading: false });
    }
  },

  signInWithGoogle: async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase must be configured for Google sign-in.');
    }

    set({ loading: true });

    try {
      const redirectTo = makeRedirectUri();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        throw error ?? new Error('Failed to start Google sign-in');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== 'success') {
        return; // User cancelled
      }

      const url = new URL(result.url);
      const params = new URLSearchParams(url.hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        throw new Error('No session returned from Google sign-in');
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        throw sessionError;
      }

      // Session is picked up by the onAuthStateChange listener
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    await clearPersistedBackendSession();
    setManualAccessToken(null, null);
    set({
      session: null,
      user: null,
      ready: true,
    });

    if (isSupabaseConfigured) {
      await supabase.auth.signOut().catch(() => {});
    }
  },
}));
