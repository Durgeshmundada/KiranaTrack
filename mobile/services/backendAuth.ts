import { ApiError, apiRequest } from '@/services/apiClient';
import { resolveBackendBaseUrls } from '@/services/backendClient';

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
        timeoutMs: 12000,
      });

      if (!response?.success || !response.data?.accessToken || !response.data?.refreshToken) {
        throw new Error('Auth response is missing session data');
      }

      return response.data;
    } catch (error) {
      lastError = error;

      if (error instanceof ApiError && error.status < 500 && error.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Backend authentication unavailable');
};

export const signInWithBackend = async (email: string, password: string): Promise<BackendAuthSession> =>
  authRequest('/auth/login', { email, password });

export const signUpWithBackend = async (email: string, password: string): Promise<BackendAuthSession> =>
  authRequest('/auth/signup', { email, password });
