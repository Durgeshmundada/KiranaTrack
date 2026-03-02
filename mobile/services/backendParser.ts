import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image as RNImage } from 'react-native';

import { ApiError } from '@/services/apiClient';
import { authApiRequest } from '@/services/backendClient';
import type { ParsedBillDraft } from '@/types/models';

const MAX_PARSE_IMAGE_WIDTH = 1400;
const PARSE_IMAGE_COMPRESS = 0.55;
const parseTimeoutMs = (() => {
  const raw = Number(process.env.EXPO_PUBLIC_PARSER_TIMEOUT_MS ?? '');
  if (!Number.isFinite(raw)) {
    return 22000;
  }
  return Math.min(Math.max(raw, 10000), 45000);
})();
const parseRetries = (() => {
  const raw = Number(process.env.EXPO_PUBLIC_PARSER_RETRIES ?? '');
  if (!Number.isInteger(raw)) {
    return 1;
  }
  return Math.min(Math.max(raw, 0), 2);
})();
const parserJobPollIntervalMs = (() => {
  const raw = Number(process.env.EXPO_PUBLIC_PARSER_JOB_POLL_INTERVAL_MS ?? '');
  if (!Number.isFinite(raw)) {
    return 700;
  }
  return Math.min(Math.max(raw, 250), 5000);
})();
const parserJobPollAttempts = (() => {
  const raw = Number(process.env.EXPO_PUBLIC_PARSER_JOB_POLL_ATTEMPTS ?? '');
  if (!Number.isInteger(raw)) {
    return 10;
  }
  return Math.min(Math.max(raw, 1), 60);
})();

const getMimeType = (imageUri: string): string => {
  const uri = imageUri.toLowerCase();
  if (uri.endsWith('.png')) {
    return 'image/png';
  }
  if (uri.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
};

const hasMeaningfulBillData = (
  draft: ParsedBillDraft | null | undefined,
): draft is ParsedBillDraft =>
  Boolean(
    draft &&
      (
        draft.billNumber?.trim() ||
        draft.vendorName?.trim() ||
        draft.date ||
        draft.totalAmountPaise !== null ||
        draft.lineItems.length > 0
      ),
  );

type ParserAsyncResponse = {
  jobId: string;
  status: 'processing' | 'queued';
};

type ParserJobSnapshot = {
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  result: ParsedBillDraft | null;
  error?: string | null;
};

const isParserAsyncResponse = (
  value: unknown,
): value is ParserAsyncResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.jobId === 'string' &&
    (row.status === 'processing' || row.status === 'queued')
  );
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const pollParserJobResult = async (jobId: string): Promise<ParsedBillDraft | null> => {
  for (let attempt = 1; attempt <= parserJobPollAttempts; attempt += 1) {
    try {
      const response = await authApiRequest<{ success?: boolean; data?: ParserJobSnapshot }>(
        `/api/parse/jobs/${jobId}`,
        {
          method: 'GET',
          timeoutMs: parseTimeoutMs,
          retries: 0,
        },
      );
      const status = response.data?.status;
      if (status === 'succeeded') {
        return hasMeaningfulBillData(response.data?.result)
          ? response.data.result
          : null;
      }
      if (status === 'failed') {
        return null;
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw error;
      }
      return null;
    }

    await wait(parserJobPollIntervalMs * attempt);
  }

  return null;
};

const getImageDimensions = async (
  imageUri: string,
): Promise<{ width: number; height: number } | null> => {
  return new Promise((resolve) => {
    RNImage.getSize(
      imageUri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
};

const optimizeImageForBackendParse = async (
  imageUri: string,
): Promise<{ uri: string; shouldCleanup: boolean }> => {
  try {
    const dimensions = await getImageDimensions(imageUri);
    const actions =
      dimensions && dimensions.width > MAX_PARSE_IMAGE_WIDTH
        ? [{ resize: { width: MAX_PARSE_IMAGE_WIDTH } }]
        : [];

    const optimized = await ImageManipulator.manipulateAsync(imageUri, actions, {
      compress: PARSE_IMAGE_COMPRESS,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return {
      uri: optimized.uri,
      shouldCleanup: optimized.uri !== imageUri,
    };
  } catch {
    return { uri: imageUri, shouldCleanup: false };
  }
};

export const parseBillImageViaBackend = async (imageUri: string): Promise<ParsedBillDraft | null> => {
  const optimized = await optimizeImageForBackendParse(imageUri);

  const base64 = await FileSystem.readAsStringAsync(optimized.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mimeType = getMimeType(optimized.uri);
  const imageDataUrl = `data:${mimeType};base64,${base64}`;

  try {
    const payload = await authApiRequest<{
      success?: boolean;
      data?: ParsedBillDraft | ParserAsyncResponse;
    }>(
      '/api/parse/bill-image',
      {
        method: 'POST',
        body: { imageDataUrl },
        timeoutMs: parseTimeoutMs,
        retries: parseRetries,
        retryDelayMs: 500,
      },
    );

    if (isParserAsyncResponse(payload.data)) {
      return pollParserJobResult(payload.data.jobId);
    }

    return hasMeaningfulBillData(payload.data) ? payload.data : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw error;
    }
    return null;
  } finally {
    if (optimized.shouldCleanup) {
      await FileSystem.deleteAsync(optimized.uri, { idempotent: true }).catch(() => {});
    }
  }
};

export const parseBillTextViaBackend = async (
  text: string,
): Promise<ParsedBillDraft | null> => {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  try {
    const payload = await authApiRequest<{
      success?: boolean;
      data?: ParsedBillDraft | ParserAsyncResponse;
    }>(
      '/api/parse/bill-text',
      {
        method: 'POST',
        body: {
          text: normalized.length > 30_000 ? normalized.slice(0, 30_000) : normalized,
        },
        timeoutMs: parseTimeoutMs,
        retries: parseRetries,
        retryDelayMs: 500,
      },
    );

    if (isParserAsyncResponse(payload.data)) {
      return pollParserJobResult(payload.data.jobId);
    }

    return hasMeaningfulBillData(payload.data) ? payload.data : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw error;
    }
    return null;
  }
};
