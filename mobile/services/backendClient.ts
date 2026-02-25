import { ApiError, apiRequest, type RequestOptions } from '@/services/apiClient';
import { supabase } from '@/services/supabaseClient';
import * as Linking from 'expo-linking';

let cachedAccessToken: string | null = null;
let manualAccessToken: string | null = null;
let authListenerBound = false;
const DEPLOYED_BACKEND_BASE_URL = 'https://kiranatrack-backend.onrender.com';

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

  const inferred = getInferredExpoBaseUrl();
  if (inferred && !urls.includes(inferred)) {
    urls.push(inferred);
  }

  if (!configured || isPrivateOrLocalHost(configured)) {
    if (!urls.includes(DEPLOYED_BACKEND_BASE_URL)) {
      urls.push(DEPLOYED_BACKEND_BASE_URL);
    }
  }

  return urls;
};

export const setManualAccessToken = (token: string | null): void => {
  manualAccessToken = token;
  cachedAccessToken = token;
};

const ensureAuthListener = (): void => {
  if (authListenerBound) {
    return;
  }

  authListenerBound = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? null;
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

export const authApiRequest = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const baseUrls = getCandidateBaseUrls();
  if (baseUrls.length === 0) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured');
  }

  const authHeader = await getAuthHeader();

  let lastError: unknown = null;

  for (const baseUrl of baseUrls) {
    try {
      return await apiRequest<T>(`${baseUrl}${path}`, {
        ...options,
        headers: {
          ...(options.headers ?? {}),
          ...authHeader,
        },
      });
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Backend unreachable from this device/network');
};

export const resolveBackendBaseUrl = (): string | null => {
  const [first] = getCandidateBaseUrls();
  return first ?? null;
};

export const resolveBackendBaseUrls = (): string[] => getCandidateBaseUrls();
