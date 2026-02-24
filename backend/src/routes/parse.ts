import { Router } from 'express';

import { env } from '../config/env';
import { parseBillImageWithGroq, parseBillTextWithGroq } from '../services/groqParser';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError, parseBody, sendOk } from '../utils/http';
import { parseBillImageSchema, parseBillTextSchema } from '../validators/schemas';

const parseRouter = Router();

parseRouter.post(
  '/bill-image',
  asyncHandler(async (req, res) => {
    if (!env.GROQ_API_KEY) {
      throw new HttpError(503, 'Parser service unavailable: GROQ_API_KEY not configured');
    }

    const payload = parseBody(parseBillImageSchema, req.body);
    const parsed = await parseBillImageWithGroq(payload.imageDataUrl);

    if (!parsed) {
      throw new HttpError(422, 'Unable to parse bill image');
    }

    sendOk(res, parsed);
  }),
);

parseRouter.post(
  '/bill-text',
  asyncHandler(async (req, res) => {
    if (!env.GROQ_API_KEY) {
      throw new HttpError(503, 'Parser service unavailable: GROQ_API_KEY not configured');
    }

    const payload = parseBody(parseBillTextSchema, req.body);
    const parsed = await parseBillTextWithGroq(payload.text);

    if (!parsed) {
      throw new HttpError(422, 'Unable to parse OCR text');
    }

    sendOk(res, parsed);
  }),
);

export { parseRouter };
