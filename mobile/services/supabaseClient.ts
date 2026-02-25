import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
const fallbackSupabaseUrl = 'https://placeholder.invalid';
const fallbackSupabaseAnonKey = 'public-anon-placeholder';

type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

const memoryStorage: AuthStorage = {
  getItem: async (key) => memoryStore.get(key) ?? null,
  setItem: async (key, value) => {
    memoryStore.set(key, value);
  },
  removeItem: async (key) => {
    memoryStore.delete(key);
  },
};

// Use in-memory auth storage so login is session-only (no persisted login across app relaunch).
const authStorage: AuthStorage = memoryStorage;

export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? 'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
    : null;

export const isSupabaseConfigured = supabaseConfigError === null;

const activeSupabaseUrl = supabaseUrl ?? fallbackSupabaseUrl;
const activeSupabaseAnonKey = supabaseAnonKey ?? fallbackSupabaseAnonKey;

export const supabase = createClient(activeSupabaseUrl, activeSupabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
