import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
const fallbackSupabaseUrl = 'https://placeholder.invalid';
const fallbackSupabaseAnonKey = 'public-anon-placeholder';

type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const authStorage: AuthStorage = {
  getItem: async (key) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // Ignore storage failures and keep session in-memory at runtime.
    }
  },
  removeItem: async (key) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
  },
};

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
    persistSession: true,
    detectSessionInUrl: false,
  },
});
