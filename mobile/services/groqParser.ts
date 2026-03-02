import * as FileSystem from 'expo-file-system/legacy';

import type { ParsedBillDraft } from '@/types/models';
import { rupeeToPaise } from '@/utils/currency';

const DIRECT_GROQ_TIMEOUT_MS = (() => {
  const raw = Number(process.env.EXPO_PUBLIC_DIRECT_GROQ_TIMEOUT_MS ?? '');
  if (!Number.isFinite(raw)) {
    return 18000;
  }
  return Math.min(Math.max(raw, 10000), 45000);
})();
const DIRECT_GROQ_MAX_ATTEMPTS = (() => {
  const retries = Number(process.env.EXPO_PUBLIC_DIRECT_GROQ_RETRIES ?? '');
  const safeRetries = Number.isInteger(retries) ? Math.min(Math.max(retries, 0), 2) : 1;
  return safeRetries + 1;
})();
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const extractJsonFromText = (raw: string): ParsedBillDraft | null => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const candidate = raw.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as ParsedBillDraft;
  } catch {
    return null;
  }
};

const parseDateToIso = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }

  const match = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!match) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const [, dd, mm, yyyy] = match;
  const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/[^0-9.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeParsedBill = (input: unknown): ParsedBillDraft | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const billNumber = (raw.bill_number ?? raw.billNumber ?? null) as string | null;
  const vendorName = (raw.vendor_name ?? raw.vendorName ?? null) as string | null;
  const dateRaw = (raw.date ?? null) as string | null;

  const totalRupee = toNumber(raw.total_amount ?? raw.totalAmount ?? raw.totalAmountRupees ?? null);
  const totalAmountPaise = totalRupee === null ? null : rupeeToPaise(totalRupee);

  const lineItemsRaw = Array.isArray(raw.line_items)
    ? raw.line_items
    : Array.isArray(raw.lineItems)
      ? raw.lineItems
      : [];

  const lineItems = lineItemsRaw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? '').trim();
      const qty = toNumber(row.qty) ?? 0;
      const rateRupee = toNumber(row.rate) ?? 0;
      const amountRupee = toNumber(row.amount) ?? 0;

      if (!name) {
        return null;
      }

      return {
        name,
        qty,
        ratePaise: rupeeToPaise(rateRupee),
        amountPaise: rupeeToPaise(amountRupee || rateRupee * qty),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return {
    billNumber,
    vendorName,
    date: parseDateToIso(dateRaw),
    totalAmountPaise,
    lineItems,
  };
};

const hasMeaningfulBillData = (draft: ParsedBillDraft | null): draft is ParsedBillDraft => {
  if (!draft) {
    return false;
  }

  return Boolean(
    draft.billNumber?.trim() ||
      draft.vendorName?.trim() ||
      draft.date ||
      draft.totalAmountPaise !== null ||
      draft.lineItems.length > 0,
  );
};

const parseGroqResponse = async (response: Response): Promise<ParsedBillDraft | null> => {
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  const json = extractJsonFromText(content);
  const normalized = json ? normalizeParsedBill(json) : null;
  return hasMeaningfulBillData(normalized) ? normalized : null;
};

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

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const requestGroqWithRetry = async (params: {
  apiKey: string;
  model: string;
  maxTokens: number;
  messages: Array<
    | { role: 'system' | 'user'; content: string }
    | {
        role: 'user';
        content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
      }
  >;
}): Promise<ParsedBillDraft | null> => {
  for (let attempt = 1; attempt <= DIRECT_GROQ_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${params.apiKey}`,
          },
          body: JSON.stringify({
            model: params.model,
            temperature: 0,
            messages: params.messages,
            max_tokens: params.maxTokens,
          }),
        },
        DIRECT_GROQ_TIMEOUT_MS,
      );

      const parsed = await parseGroqResponse(response);
      if (parsed) {
        return parsed;
      }

      const shouldRetry =
        attempt < DIRECT_GROQ_MAX_ATTEMPTS &&
        (response.ok || RETRYABLE_STATUS_CODES.has(response.status));
      if (!shouldRetry) {
        return null;
      }
    } catch {
      if (attempt >= DIRECT_GROQ_MAX_ATTEMPTS) {
        return null;
      }
    }

    await wait(400 * attempt);
  }

  return null;
};

export const parseBillWithGroq = async (ocrText: string): Promise<ParsedBillDraft | null> => {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  return requestGroqWithRetry({
    apiKey,
    model: 'llama-3.3-70b-versatile',
    maxTokens: 500,
    messages: [
      {
        role: 'system',
        content: `You are a bill parser.
Extract bill fields from OCR text and return ONLY valid JSON:
{
  "bill_number": "string or null",
  "vendor_name": "string or null",
  "date": "YYYY-MM-DD or null",
  "total_amount": "number in rupees or null",
  "line_items": [{"name":"string","qty":"number","rate":"number","amount":"number"}]
}
If unknown, use null.`,
      },
      {
        role: 'user',
        content: ocrText,
      },
    ],
  });
};

export const parseBillImageWithGroq = async (imageUri: string): Promise<ParsedBillDraft | null> => {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mimeType = getMimeType(imageUri);
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return requestGroqWithRetry({
    apiKey,
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    maxTokens: 800,
    messages: [
      {
        role: 'system',
        content: `You are a bill parser.
Extract structured JSON from Indian supplier bill image.
Return ONLY valid JSON:
{
  "bill_number": "string or null",
  "vendor_name": "string or null",
  "date": "YYYY-MM-DD or null",
  "total_amount": "number in rupees or null",
  "line_items": [{"name":"string","qty":"number","rate":"number","amount":"number"}]
}
No explanation.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Parse this bill image and return the required JSON only.',
          },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
            },
          },
        ],
      },
    ],
  });
};
