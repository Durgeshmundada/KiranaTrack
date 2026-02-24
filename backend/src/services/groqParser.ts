import { env } from '../config/env';

export interface ParsedBillDraft {
  billNumber: string | null;
  vendorName: string | null;
  date: string | null;
  totalAmountPaise: number | null;
  lineItems: Array<{
    name: string;
    qty: number;
    ratePaise: number;
    amountPaise: number;
  }>;
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

const rupeeToPaise = (value: number): number => Math.round(value * 100);

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

const parseDateToIso = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }

  const match = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const extractJsonFromText = (raw: string): unknown | null => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const normalizeParsedBill = (input: unknown): ParsedBillDraft | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const totalRupee = toNumber(raw.total_amount ?? raw.totalAmount ?? null);
  const lineItemsRaw = Array.isArray(raw.line_items)
    ? raw.line_items
    : Array.isArray(raw.lineItems)
      ? raw.lineItems
      : [];

  const lineItems = lineItemsRaw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? '').trim();
      if (!name) {
        return null;
      }
      const qty = toNumber(row.qty) ?? 0;
      const rateRupee = toNumber(row.rate) ?? 0;
      const amountRupee = toNumber(row.amount) ?? 0;

      return {
        name,
        qty,
        ratePaise: rupeeToPaise(rateRupee),
        amountPaise: rupeeToPaise(amountRupee || rateRupee * qty),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    billNumber: (raw.bill_number ?? raw.billNumber ?? null) as string | null,
    vendorName: (raw.vendor_name ?? raw.vendorName ?? null) as string | null,
    date: parseDateToIso(raw.date ?? null),
    totalAmountPaise: totalRupee === null ? null : rupeeToPaise(totalRupee),
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

const parserTimeoutMs = Math.max(6000, Math.min(env.GROQ_TIMEOUT_MS, 45000));
const parserMaxAttempts = env.GROQ_MAX_RETRIES + 1;
const retryableStatusCodes = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const getAbortSignal = (timeoutMs: number): AbortSignal => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const requestGroqWithRetry = async (params: {
  model: string;
  maxTokens: number;
  messages: GroqMessage[];
}): Promise<ParsedBillDraft | null> => {
  for (let attempt = 1; attempt <= parserMaxAttempts; attempt += 1) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: params.model,
          temperature: 0,
          messages: params.messages,
          max_tokens: params.maxTokens,
        }),
        signal: getAbortSignal(parserTimeoutMs),
      });

      const parsed = await parseGroqResponse(response);
      if (parsed) {
        return parsed;
      }

      const shouldRetry =
        attempt < parserMaxAttempts &&
        (response.ok || retryableStatusCodes.has(response.status));
      if (!shouldRetry) {
        return null;
      }
    } catch {
      if (attempt >= parserMaxAttempts) {
        return null;
      }
    }

    await wait(450 * attempt);
  }

  return null;
};

export const parseBillImageWithGroq = async (imageDataUrl: string): Promise<ParsedBillDraft | null> => {
  if (!env.GROQ_API_KEY) {
    return null;
  }

  return requestGroqWithRetry({
    model: env.GROQ_IMAGE_MODEL,
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
          { type: 'text', text: 'Parse this bill image and return only JSON.' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });
};

export const parseBillTextWithGroq = async (text: string): Promise<ParsedBillDraft | null> => {
  if (!env.GROQ_API_KEY) {
    return null;
  }

  return requestGroqWithRetry({
    model: env.GROQ_TEXT_MODEL,
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
        content: text,
      },
    ],
  });
};
