import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config/env';
import { parseBillImageWithGroq, parseBillTextWithGroq } from '../services/groqParser';
import { enqueueParserJob, getParserJob, waitForParserJob } from '../services/parserQueue';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError, notFound, parseBody, sendOk } from '../utils/http';
import { parseBillImageSchema, parseBillTextSchema } from '../validators/schemas';

const parseRouter = Router();
const jobIdParamSchema = z.object({
  jobId: z.string().min(1),
});

const runImageParsing = async (imageDataUrl: string) => {
  if (!env.PARSER_QUEUE_ENABLED) {
    return parseBillImageWithGroq(imageDataUrl);
  }

  const queued = enqueueParserJob({
    type: 'bill-image',
    imageDataUrl,
  });
  const job = await waitForParserJob(queued.jobId, env.PARSER_SYNC_WAIT_MS);

  if (!job || job.status === 'queued' || job.status === 'processing') {
    return {
      jobId: queued.jobId,
      status: 'processing' as const,
    };
  }

  return job.status === 'succeeded'
    ? {
        jobId: queued.jobId,
        status: 'succeeded' as const,
        result: job.result,
      }
    : {
        jobId: queued.jobId,
        status: 'failed' as const,
      };
};

const runTextParsing = async (text: string) => {
  if (!env.PARSER_QUEUE_ENABLED) {
    return parseBillTextWithGroq(text);
  }

  const queued = enqueueParserJob({
    type: 'bill-text',
    text,
  });
  const job = await waitForParserJob(queued.jobId, env.PARSER_SYNC_WAIT_MS);

  if (!job || job.status === 'queued' || job.status === 'processing') {
    return {
      jobId: queued.jobId,
      status: 'processing' as const,
    };
  }

  return job.status === 'succeeded'
    ? {
        jobId: queued.jobId,
        status: 'succeeded' as const,
        result: job.result,
      }
    : {
        jobId: queued.jobId,
        status: 'failed' as const,
      };
};

parseRouter.post(
  '/bill-image',
  asyncHandler(async (req, res) => {
    if (!env.GROQ_API_KEY) {
      throw new HttpError(503, 'Parser service unavailable: GROQ_API_KEY not configured');
    }

    const payload = parseBody(parseBillImageSchema, req.body);
    const parsed = await runImageParsing(payload.imageDataUrl);

    if (parsed && typeof parsed === 'object' && 'status' in parsed) {
      if (parsed.status === 'processing') {
        res.status(202).json({
          success: true,
          data: {
            jobId: parsed.jobId,
            status: parsed.status,
          },
        });
        return;
      }

      if (parsed.status === 'succeeded' && parsed.result) {
        sendOk(res, parsed.result);
        return;
      }
    }

    if (!parsed || (typeof parsed === 'object' && 'status' in parsed && parsed.status === 'failed')) {
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
    const parsed = await runTextParsing(payload.text);

    if (parsed && typeof parsed === 'object' && 'status' in parsed) {
      if (parsed.status === 'processing') {
        res.status(202).json({
          success: true,
          data: {
            jobId: parsed.jobId,
            status: parsed.status,
          },
        });
        return;
      }

      if (parsed.status === 'succeeded' && parsed.result) {
        sendOk(res, parsed.result);
        return;
      }
    }

    if (!parsed || (typeof parsed === 'object' && 'status' in parsed && parsed.status === 'failed')) {
      throw new HttpError(422, 'Unable to parse OCR text');
    }

    sendOk(res, parsed);
  }),
);

parseRouter.get(
  '/jobs/:jobId',
  asyncHandler(async (req, res) => {
    const { jobId } = jobIdParamSchema.parse(req.params);
    const job = getParserJob(jobId);
    if (!job) {
      notFound('Parser job');
      return;
    }

    sendOk(res, job);
  }),
);

export { parseRouter };
