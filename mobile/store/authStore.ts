import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { type BackendAuthSession, signInWithBackend, signUpWithBackend } from '@/services/backendAuth';
import { setManualAccessToken } from '@/services/backendClient';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';

interface AuthState {
  ready: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
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
    await AsyncStorage.removeItem(BACKEND_SESSION_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(
    BACKEND_SESSION_STORAGE_KEY,
    JSON.stringify(payload),
  );
};

const readPersistedBackendSession = async (): Promise<BackendAuthSession | null> => {
  const raw = await AsyncStorage.getItem(BACKEND_SESSION_STORAGE_KEY);
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

    const activeSupabaseSession = error ? null : (data?.session ?? null);
    if (activeSupabaseSession) {
      set({
        session: activeSupabaseSession,
        user: activeSupabaseSession.user ?? null,
        ready: true,
      });
      setManualAccessToken(
        activeSupabaseSession.access_token,
        activeSupabaseSession.refresh_token,
      );
      await clearPersistedBackendSession();
    } else {
      const persistedBackendSession = await readPersistedBackendSession();
      if (persistedBackendSession) {
        await applyPersistedBackendSession(persistedBackendSession, set);
      } else {
        if (error) {
          initialized = false;
        }
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
      try {
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
        return;
      } catch (backendError) {
        if (!isSupabaseConfigured) {
          throw backendError;
        }

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

        setManualAccessToken(null, null);
        await clearPersistedBackendSession();
        set({
          session: data.session,
          user: data.user ?? null,
          ready: true,
        });
      }
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    set({ loading: true });

    try {
      try {
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
        return;
      } catch (backendError) {
        if (!isSupabaseConfigured) {
          throw backendError;
        }

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

        setManualAccessToken(null, null);
        await clearPersistedBackendSession();
        set({
          session: data.session,
          user: data.user ?? null,
          ready: true,
        });
      }
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
