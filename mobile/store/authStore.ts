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
    setManualAccessToken(null);

    if (!isSupabaseConfigured) {
      set({
        session: null,
        user: null,
        ready: true,
      });
      return;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      initialized = false;
      set({
        session: null,
        user: null,
        ready: true,
      });
      return;
    }

    set({
      session: data.session,
      user: data.session?.user ?? null,
      ready: true,
    });
    setManualAccessToken(data.session?.access_token ?? null);

    if (!listenerBound) {
      listenerBound = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
          ready: true,
        });
        setManualAccessToken(session?.access_token ?? null);
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
        setManualAccessToken(backendSession.accessToken);
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

        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error || !data.session) {
          throw error ?? new Error('Authentication failed');
        }

        setManualAccessToken(null);
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
        setManualAccessToken(backendSession.accessToken);
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

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        if (error) {
          throw error;
        }

        setManualAccessToken(null);
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
    setManualAccessToken(null);
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
