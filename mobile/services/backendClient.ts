import { ApiError, apiRequest, type RequestOptions } from '@/services/apiClient';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';
import * as Linking from 'expo-linking';

let cachedAccessToken: string | null = null;
let manualAccessToken: string | null = null;
let manualRefreshToken: string | null = null;
let authListenerBound = false;
let preferredBaseUrl: string | null = null;
const failedBaseUrls = new Map<string, number>();
const BASE_URL_FAILURE_COOLDOWN_MS = 30_000;
const enableBackendFallback =
  process.env.EXPO_PUBLIC_ENABLE_BACKEND_FALLBACK === 'true';
const fallbackBackendBaseUrl = (
  process.env.EXPO_PUBLIC_FALLBACK_API_BASE_URL?.trim() ?? ''
).replace(/\/$/, '');

const getConfiguredBaseUrl = (): string | null => {
  const value = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';
  if (!value) {
    return null;
  }

  return value.replace(/\/$/, '');
};

const isPrivateOrLocalHost = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname.endsWith('.local')) {
      return true;
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      return (
        hostname.startsWith('10.') ||
        hostname.startsWith('127.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
      );
    }

    return false;
  } catch {
    return false;
  }
};

const getInferredExpoBaseUrl = (): string | null => {
  try {
    const appUrl = Linking.createURL('/');
    const parsed = new URL(appUrl);
    if (!parsed.hostname) {
      return null;
    }
    return `http://${parsed.hostname}:4000`;
  } catch {
    return null;
  }
};

const getCandidateBaseUrls = (): string[] => {
  const urls: string[] = [];
  const configured = getConfiguredBaseUrl();
  if (configured) {
    urls.push(configured);
  }

  if (!configured) {
    const inferred = getInferredExpoBaseUrl();
    if (inferred && !urls.includes(inferred)) {
      urls.push(inferred);
    }
  }

  if (
    enableBackendFallback &&
    fallbackBackendBaseUrl &&
    (!configured || isPrivateOrLocalHost(configured)) &&
    !urls.includes(fallbackBackendBaseUrl)
  ) {
    urls.push(fallbackBackendBaseUrl);
  }

  return urls;
};

const dedupeBaseUrls = (urls: string[]): string[] =>
  [...new Set(urls.filter((value) => Boolean(value.trim())))];

const orderCandidateBaseUrls = (urls: string[]): string[] => {
  const deduped = dedupeBaseUrls(urls);
  if (deduped.length === 0) {
    return deduped;
  }

  const now = Date.now();
  const currentlyReachable = deduped.filter((url) => {
    const blockedUntil = failedBaseUrls.get(url) ?? 0;
    return blockedUntil <= now;
  });
  const prioritizedPool = currentlyReachable.length > 0 ? currentlyReachable : deduped;

  if (preferredBaseUrl && prioritizedPool.includes(preferredBaseUrl)) {
    return [
      preferredBaseUrl,
      ...prioritizedPool.filter((url) => url !== preferredBaseUrl),
    ];
  }

  return prioritizedPool;
};

const shouldMarkBaseUrlFailed = (error: unknown): boolean => {
  if (!(error instanceof ApiError)) {
    return true;
  }

  if (error.status >= 500) {
    return true;
  }

  return error.status === 408 || error.status === 429;
};

export const reportBackendBaseUrlSuccess = (baseUrl: string): void => {
  preferredBaseUrl = baseUrl;
  failedBaseUrls.delete(baseUrl);
};

export const reportBackendBaseUrlFailure = (
  baseUrl: string,
  error: unknown,
): void => {
  if (!shouldMarkBaseUrlFailed(error)) {
    return;
  }

  failedBaseUrls.set(baseUrl, Date.now() + BASE_URL_FAILURE_COOLDOWN_MS);
};

const getOrderedBackendBaseUrls = (): string[] =>
  orderCandidateBaseUrls(getCandidateBaseUrls());

export const setManualAccessToken = (
  token: string | null,
  refreshToken?: string | null,
): void => {
  manualAccessToken = token;
  cachedAccessToken = token;
  if (refreshToken !== undefined) {
    manualRefreshToken = refreshToken;
  }
  if (!token) {
    manualRefreshToken = null;
  }
};

const ensureAuthListener = (): void => {
  if (authListenerBound) {
    return;
  }

  authListenerBound = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? null;
    manualRefreshToken = session?.refresh_token ?? manualRefreshToken;
  });
};

const getAuthHeader = async (): Promise<Record<string, string>> => {
  ensureAuthListener();

  if (manualAccessToken) {
    return {
      Authorization: `Bearer ${manualAccessToken}`,
    };
  }

  if (cachedAccessToken) {
    return {
      Authorization: `Bearer ${cachedAccessToken}`,
    };
  }

  if (!isSupabaseConfigured) {
    throw new ApiError('Authentication required', 401, null);
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError('Authentication required', 401, null);
  }

  cachedAccessToken = token;

  return {
    Authorization: `Bearer ${token}`,
  };
};

const tryRefreshAuthHeader = async (): Promise<Record<string, string> | null> => {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase.auth.refreshSession(
    manualRefreshToken
      ? {
          refresh_token: manualRefreshToken,
        }
      : undefined,
  );
  if (error) {
    const normalized = error.message.toLowerCase();
    if (
      normalized.includes('invalid refresh token') ||
      normalized.includes('refresh token not found') ||
      normalized.includes('already used')
    ) {
      cachedAccessToken = null;
      manualAccessToken = null;
      manualRefreshToken = null;
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    return null;
  }

  const token = data.session?.access_token ?? null;
  const refreshToken = data.session?.refresh_token ?? null;
  if (!token) {
    return null;
  }

  cachedAccessToken = token;
  manualAccessToken = token;
  if (refreshToken) {
    manualRefreshToken = refreshToken;
  }
  return {
    Authorization: `Bearer ${token}`,
  };
};

export const authApiRequest = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const baseUrls = getOrderedBackendBaseUrls();
  if (baseUrls.length === 0) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured');
  }

  const authHeader = await getAuthHeader();

  let lastError: unknown = null;

  for (const baseUrl of baseUrls) {
    try {
      const response = await apiRequest<T>(`${baseUrl}${path}`, {
        ...options,
        headers: {
          ...(options.headers ?? {}),
          ...authHeader,
        },
      });
      reportBackendBaseUrlSuccess(baseUrl);
      return response;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        const refreshedHeader = await tryRefreshAuthHeader();
        if (refreshedHeader) {
          try {
            const refreshedResponse = await apiRequest<T>(`${baseUrl}${path}`, {
              ...options,
              headers: {
                ...(options.headers ?? {}),
                ...refreshedHeader,
              },
            });
            reportBackendBaseUrlSuccess(baseUrl);
            return refreshedResponse;
          } catch (refreshError) {
            error = refreshError;
          }
        }
      }

      reportBackendBaseUrlFailure(baseUrl, error);
      lastError = error;
      if (error instanceof ApiError) {
        if (error.status === 401) {
          throw new ApiError('Session expired. Please sign in again.', 401, error.payload);
        }
        if (error.status >= 500) {
          continue;
        }
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Backend unreachable from this device/network');
};

export const resolveBackendBaseUrl = (): string | null => {
  const [first] = getOrderedBackendBaseUrls();
  return first ?? null;
};

export const resolveBackendBaseUrls = (): string[] => getOrderedBackendBaseUrls();
