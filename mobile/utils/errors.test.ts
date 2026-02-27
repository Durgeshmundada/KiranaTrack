import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/apiClient';
import { isSessionExpiredError, resolveUserErrorMessage } from '@/utils/errors';

describe('error helpers', () => {
  it('detects session expiry from API 401', () => {
    expect(isSessionExpiredError(new ApiError('Session expired', 401, null))).toBe(true);
    expect(isSessionExpiredError(new ApiError('Conflict', 409, null))).toBe(false);
  });

  it('maps network-like errors to offline guidance', () => {
    expect(
      resolveUserErrorMessage(
        new Error('Network request failed. Please check your internet connection.'),
        'fallback',
      ),
    ).toBe('You are offline. Reconnect to internet and retry.');
  });

  it('returns ApiError message when available', () => {
    expect(resolveUserErrorMessage(new ApiError('Conflict', 409, null), 'fallback')).toBe(
      'Conflict',
    );
  });
});
