import { ApiError } from '@/services/apiClient';

const toLowerMessage = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return '';
  }
  return error.message.trim().toLowerCase();
};

export const isSessionExpiredError = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401;

export const resolveUserErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof ApiError) {
    return error.message || fallbackMessage;
  }

  if (error instanceof Error) {
    const normalized = toLowerMessage(error);

    if (
      normalized.includes('offline') ||
      normalized.includes('network request failed') ||
      normalized.includes('internet connection') ||
      normalized.includes('failed to fetch')
    ) {
      return 'You are offline. Reconnect to internet and retry.';
    }

    if (normalized.includes('timed out') || normalized.includes('timeout')) {
      return 'Request timed out. Please retry in a few seconds.';
    }

    if (error.message.trim()) {
      return error.message.trim();
    }
  }

  return fallbackMessage;
};
