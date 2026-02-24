import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/services/supabaseClient';

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

    if (!listenerBound) {
      listenerBound = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
          ready: true,
        });
      });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        throw error;
      }
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (email, password) => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        throw error;
      }
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  },
}));
