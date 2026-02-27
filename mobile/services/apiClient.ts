export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const tryParseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const apiRequest = async <T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> => {
  const {
    method = 'GET',
    body,
    headers = {},
    timeoutMs,
    retries,
    retryDelayMs = 700,
  } = options;
  const effectiveTimeoutMs = timeoutMs ?? (method === 'GET' ? 12000 : 7000);
  const effectiveRetries = retries ?? (method === 'GET' ? 1 : 0);

  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        },
        effectiveTimeoutMs,
      );

      const payload = await tryParseJson(response);
      if (!response.ok) {
        const message =
          (payload as { message?: string } | null)?.message ??
          `Request failed with status ${response.status}`;
        throw new ApiError(message, response.status, payload);
      }

      return payload as T;
    } catch (error) {
      const shouldRetry =
        attempt <= effectiveRetries &&
        (!(error instanceof ApiError) || (error.status >= 500 && error.status < 600));

      if (!shouldRetry) {
        if (!(error instanceof ApiError)) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('Request timed out. Please check your internet and try again.');
          }

          if (error instanceof TypeError) {
            throw new Error('Network request failed. Please check your internet connection.');
          }
        }

        throw error;
      }

      await wait(retryDelayMs * attempt);
    }
  }
};
