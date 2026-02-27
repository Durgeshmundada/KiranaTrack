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
    const payload = await authApiRequest<{ success?: boolean; data?: ParsedBillDraft }>(
      '/api/parse/bill-image',
      {
        method: 'POST',
        body: { imageDataUrl },
        timeoutMs: parseTimeoutMs,
        retries: parseRetries,
        retryDelayMs: 500,
      },
    );
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
    const payload = await authApiRequest<{ success?: boolean; data?: ParsedBillDraft }>(
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
    return hasMeaningfulBillData(payload.data) ? payload.data : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw error;
    }
    return null;
  }
};
