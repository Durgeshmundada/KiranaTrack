import { ApiError, apiRequest, type RequestOptions } from '@/services/apiClient';
import { supabase } from '@/services/supabaseClient';
import * as Linking from 'expo-linking';

let cachedAccessToken: string | null = null;
let authListenerBound = false;

const getConfiguredBaseUrl = (): string | null => {
  const value = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';
  if (!value) {
    return null;
  }

  return value.replace(/\/$/, '');
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
  const configured = getConfiguredBaseUrl();
  if (configured) {
    return [configured];
  }

  const inferred = getInferredExpoBaseUrl();
  return inferred ? [inferred] : [];
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
