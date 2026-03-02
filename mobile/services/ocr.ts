import * as FileSystem from 'expo-file-system/legacy';

const OCR_API_URL = 'https://api.ocr.space/parse/image';
const OCR_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.EXPO_PUBLIC_OCR_TIMEOUT_MS ?? 12000), 3000),
  30000,
);
const OCR_API_KEY = process.env.EXPO_PUBLIC_OCR_SPACE_API_KEY?.trim() ?? '';

const getMimeType = (imageUri: string): string => {
  const lower = imageUri.toLowerCase();
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
};

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

type OcrSpaceResponse = {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string[] | string;
  ParsedResults?: Array<{
    ParsedText?: string;
  }>;
};

export const runOcrFallback = async (imageUri: string): Promise<string> => {
  if (!OCR_API_KEY) {
    return '';
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) {
      return '';
    }

    const mimeType = getMimeType(imageUri);
    const encodedBody = new URLSearchParams({
      apikey: OCR_API_KEY,
      language: 'eng',
      isOverlayRequired: 'false',
      detectOrientation: 'true',
      scale: 'true',
      OCREngine: '2',
      base64Image: `data:${mimeType};base64,${base64}`,
    }).toString();

    const response = await fetchWithTimeout(
      OCR_API_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: encodedBody,
      },
      OCR_TIMEOUT_MS,
    );

    if (!response.ok) {
      return '';
    }

    const payload = (await response.json()) as OcrSpaceResponse;
    if (payload.IsErroredOnProcessing) {
      return '';
    }

    const text = payload.ParsedResults?.map((item) => item.ParsedText ?? '').join('\n');
    return text?.trim() ?? '';
  } catch {
    return '';
  }
};
