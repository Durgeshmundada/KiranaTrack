import { ApiError, apiRequest } from '@/services/apiClient';
import { resolveBackendBaseUrl } from '@/services/backendClient';

interface HealthPayload {
  success: boolean;
  service: string;
  timestamp: string;
  dbState?: string;
}

export interface BackendHealthResult {
  ok: boolean;
  message: string;
  dbState: string | null;
  baseUrl: string | null;
}

export const checkBackendHealth = async (): Promise<BackendHealthResult> => {
  const baseUrl = resolveBackendBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      message: 'EXPO_PUBLIC_API_BASE_URL is not configured',
      dbState: null,
      baseUrl: null,
    };
  }

  try {
    const payload = await apiRequest<HealthPayload>(`${baseUrl}/health/detailed`, {
      method: 'GET',
      timeoutMs: 8000,
      retries: 1,
      retryDelayMs: 500,
    });

    return {
      ok: payload.success,
      message: 'Backend reachable',
      dbState: payload.dbState ?? null,
      baseUrl,
    };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      try {
        const payload = await apiRequest<HealthPayload>(`${baseUrl}/health`, {
          method: 'GET',
          timeoutMs: 8000,
          retries: 1,
          retryDelayMs: 500,
        });

        return {
          ok: payload.success,
          message: 'Backend reachable (detailed health is restricted)',
          dbState: null,
          baseUrl,
        };
      } catch {
        // Fall through to unreachable response.
      }
    }

    return {
      ok: false,
      message: 'Backend unreachable from this device/network',
      dbState: null,
      baseUrl,
    };
  }
};
