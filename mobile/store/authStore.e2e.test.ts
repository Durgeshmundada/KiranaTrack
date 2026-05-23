import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionStorageMap = new Map<string, string>();

vi.mock('expo-auth-session', () => ({
  makeRedirectUri: vi.fn(() => 'kiranatrack://auth'),
}));

vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: vi.fn(),
}));

vi.mock('@/services/sessionStorage', () => ({
  getSessionStorageItem: vi.fn(async (key: string) => sessionStorageMap.get(key) ?? null),
  setSessionStorageItem: vi.fn(async (key: string, value: string) => {
    sessionStorageMap.set(key, value);
  }),
  removeSessionStorageItem: vi.fn(async (key: string) => {
    sessionStorageMap.delete(key);
  }),
}));

vi.mock('@/services/backendAuth', () => ({
  signInWithBackend: vi.fn(async () => ({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenType: 'bearer',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: 'user-1',
      email: 'demo@example.com',
    },
  })),
  signUpWithBackend: vi.fn(),
}));

const setManualAccessTokenMock = vi.fn();
vi.mock('@/services/backendClient', () => ({
  setManualAccessToken: setManualAccessTokenMock,
}));

vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: false,
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      setSession: vi.fn(),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      refreshSession: vi.fn(),
    },
  },
}));

describe('authStore e2e-like persistence flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMap.clear();
  });

  it('keeps user logged in after module reload (app restart simulation)', async () => {
    const firstModule = await import('@/store/authStore');
    await firstModule.useAuthStore.getState().signIn('demo@example.com', 'StrongPass#123');

    const signedInState = firstModule.useAuthStore.getState();
    expect(signedInState.session?.user.email).toBe('demo@example.com');
    expect(signedInState.ready).toBe(true);

    vi.resetModules();

    const secondModule = await import('@/store/authStore');
    await secondModule.useAuthStore.getState().initialize();

    const restoredState = secondModule.useAuthStore.getState();
    expect(restoredState.ready).toBe(true);
    expect(restoredState.session?.user.email).toBe('demo@example.com');
    expect(setManualAccessTokenMock).toHaveBeenCalled();
  });
});
