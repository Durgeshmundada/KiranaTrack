import { parseBillImageViaBackend, parseBillTextViaBackend } from '@/services/backendParser';
import { parseBillImageWithGroq, parseBillWithGroq } from '@/services/groqParser';
import { computeImageHash } from '@/services/imageHash';
import { runOcrFallback } from '@/services/ocr';
import { parseBillWithRegex } from '@/services/regexParser';
import type { ParsedBillDraft } from '@/types/models';

const enableDirectGroqFallback =
  __DEV__ && process.env.EXPO_PUBLIC_ENABLE_DIRECT_GROQ_FALLBACK === 'true';

export const runBillParsingPipeline = async (
  imageUri: string,
): Promise<{
  ocrText: string;
  draft: ParsedBillDraft;
  imageHash: string;
  source: 'backend-vision' | 'backend-text' | 'groq-vision' | 'groq-text' | 'regex' | 'manual';
}> => {
  const imageHash = await computeImageHash(imageUri);

  const backendVisionDraft = await parseBillImageViaBackend(imageUri);
  if (backendVisionDraft) {
    return {
      ocrText: 'Parsed from scanned image via backend parser',
      draft: backendVisionDraft,
      imageHash,
      source: 'backend-vision',
    };
  }

  const visionDraft =
    enableDirectGroqFallback
      ? await parseBillImageWithGroq(imageUri)
      : null;
  if (visionDraft) {
    return {
      ocrText: 'Parsed from scanned image with Groq Vision',
      draft: visionDraft,
      imageHash,
      source: 'groq-vision',
    };
  }

  const ocrText = await runOcrFallback(imageUri);
  const backendTextDraft = ocrText
    ? await parseBillTextViaBackend(ocrText)
    : null;
  if (backendTextDraft) {
    return {
      ocrText,
      draft: backendTextDraft,
      imageHash,
      source: 'backend-text',
    };
  }

  const groqTextDraft =
    enableDirectGroqFallback && ocrText
      ? await parseBillWithGroq(ocrText)
      : null;
  if (groqTextDraft) {
    return {
      ocrText,
      draft: groqTextDraft,
      imageHash,
      source: 'groq-text',
    };
  }

  const regexDraft = ocrText ? parseBillWithRegex(ocrText) : null;
  if (regexDraft) {
    return {
      ocrText,
      draft: regexDraft,
      imageHash,
      source: 'regex',
    };
  }

  return {
    ocrText: '',
    draft: {
      billNumber: null,
      vendorName: null,
      date: null,
      totalAmountPaise: null,
      lineItems: [],
    },
    imageHash,
    source: 'manual',
  };
};
