import { ApiError, apiRequest } from '@/services/apiClient';
import {
  reportBackendBaseUrlFailure,
  reportBackendBaseUrlSuccess,
  resolveBackendBaseUrls,
} from '@/services/backendClient';

type AuthRequestPayload = {
  email: string;
  password: string;
};

export type BackendAuthSession = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: number | null;
  user: {
    id: string;
    email: string | null;
  };
};

type BackendEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

const isPrivateOrLocalHost = (baseUrl: string): boolean => {
  try {
    const parsed = new URL(baseUrl);
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

const toAuthNetworkHint = (baseUrls: string[]): string =>
  baseUrls.every(isPrivateOrLocalHost)
    ? 'Cannot reach local backend from this device. Connect phone and PC to same Wi-Fi or use deployed API URL.'
    : 'Backend authentication unavailable. Please check network and retry.';

const authRequest = async (
  path: '/auth/login' | '/auth/signup',
  payload: AuthRequestPayload,
): Promise<BackendAuthSession> => {
  const baseUrls = resolveBackendBaseUrls();
  if (baseUrls.length === 0) {
    throw new Error('Backend URL is not configured');
  }

  let lastError: unknown = null;

  for (const baseUrl of baseUrls) {
    try {
      const response = await apiRequest<BackendEnvelope<BackendAuthSession>>(`${baseUrl}${path}`, {
        method: 'POST',
        body: payload,
        timeoutMs: 3500,
        retries: 0,
        retryDelayMs: 400,
      });

      if (!response?.success || !response.data?.accessToken || !response.data?.refreshToken) {
        throw new Error('Auth response is missing session data');
      }

      reportBackendBaseUrlSuccess(baseUrl);
      return response.data;
    } catch (error) {
      reportBackendBaseUrlFailure(baseUrl, error);
      lastError = error;

      if (error instanceof ApiError && error.status < 500 && error.status !== 404) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    const normalized = lastError.message.toLowerCase();
    if (
      normalized.includes('network request failed') ||
      normalized.includes('internet connection') ||
      normalized.includes('timed out') ||
      normalized.includes('failed to fetch')
    ) {
      throw new Error(toAuthNetworkHint(baseUrls));
    }
    throw lastError;
  }

  throw new Error(toAuthNetworkHint(baseUrls));
};

export const signInWithBackend = async (email: string, password: string): Promise<BackendAuthSession> =>
  authRequest('/auth/login', { email, password });

export const signUpWithBackend = async (email: string, password: string): Promise<BackendAuthSession> =>
  authRequest('/auth/signup', { email, password });
