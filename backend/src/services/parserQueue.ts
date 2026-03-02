import { randomUUID } from 'node:crypto';

import { env } from '../config/env';
import type { ParsedBillDraft } from './groqParser';
import { parseBillImageWithGroq, parseBillTextWithGroq } from './groqParser';
import { logInfo, logWarn } from '../observability/logger';

type ParserJobType = 'bill-image' | 'bill-text';
type ParserJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

type ParserJobPayload =
  | {
      type: 'bill-image';
      imageDataUrl: string;
    }
  | {
      type: 'bill-text';
      text: string;
    };

type ParserJobState = {
  id: string;
  type: ParserJobType;
  status: ParserJobStatus;
  attempts: number;
  maxAttempts: number;
  payload: ParserJobPayload;
  result: ParsedBillDraft | null;
  error: string | null;
  deadLetter: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ParserJobSnapshot = Omit<ParserJobState, 'payload'>;

const queue: string[] = [];
const jobs = new Map<string, ParserJobState>();
let processingWorkers = 0;
let cleanupLoopStarted = false;

const nowIso = (): string => new Date().toISOString();
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const toSnapshot = (job: ParserJobState): ParserJobSnapshot => ({
  id: job.id,
  type: job.type,
  status: job.status,
  attempts: job.attempts,
  maxAttempts: job.maxAttempts,
  result: job.result,
  error: job.error,
  deadLetter: job.deadLetter,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

const runParseForJob = async (job: ParserJobState): Promise<ParsedBillDraft | null> => {
  if (job.payload.type === 'bill-image') {
    return parseBillImageWithGroq(job.payload.imageDataUrl);
  }
  return parseBillTextWithGroq(job.payload.text);
};

const processNext = (): void => {
  while (processingWorkers < env.PARSER_QUEUE_CONCURRENCY && queue.length > 0) {
    const jobId = queue.shift();
    if (!jobId) {
      continue;
    }

    const job = jobs.get(jobId);
    if (!job || job.status !== 'queued') {
      continue;
    }

    processingWorkers += 1;

    void (async () => {
      job.status = 'processing';
      job.updatedAt = nowIso();
      job.attempts += 1;

      const parsed = await runParseForJob(job).catch((error: unknown) => {
        job.error = error instanceof Error ? error.message : String(error);
        return null;
      });

      if (parsed) {
        job.status = 'succeeded';
        job.result = parsed;
        job.error = null;
        job.updatedAt = nowIso();
        return;
      }

      if (job.attempts < job.maxAttempts) {
        job.status = 'queued';
        job.updatedAt = nowIso();
        job.error = job.error ?? 'Parser returned empty result';
        const retryDelayMs = env.PARSER_QUEUE_RETRY_DELAY_MS * job.attempts;
        setTimeout(() => {
          queue.push(job.id);
          processNext();
        }, retryDelayMs).unref();
        logWarn('parser.queue.retry_scheduled', {
          jobId: job.id,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
          retryDelayMs,
        });
        return;
      }

      job.status = 'failed';
      job.deadLetter = true;
      job.updatedAt = nowIso();
      job.error = job.error ?? 'Parser returned empty result';
      logWarn('parser.queue.dead_lettered', {
        jobId: job.id,
        attempts: job.attempts,
      });
    })()
      .finally(() => {
        processingWorkers -= 1;
        processNext();
      });
  }
};

const startCleanupLoop = (): void => {
  if (cleanupLoopStarted) {
    return;
  }

  cleanupLoopStarted = true;
  setInterval(() => {
    const cutoff = Date.now() - env.PARSER_JOB_TTL_MS;
    const expiredJobIds: string[] = [];
    jobs.forEach((job, id) => {
      const updatedAtEpoch = Date.parse(job.updatedAt);
      if (Number.isFinite(updatedAtEpoch) && updatedAtEpoch < cutoff) {
        expiredJobIds.push(id);
      }
    });

    if (expiredJobIds.length > 0) {
      expiredJobIds.forEach((id) => jobs.delete(id));
      logInfo('parser.queue.gc_pruned', {
        count: expiredJobIds.length,
      });
    }
  }, Math.min(60_000, env.PARSER_JOB_TTL_MS)).unref();
};

export const enqueueParserJob = (payload: ParserJobPayload): { jobId: string } => {
  startCleanupLoop();
  const id = randomUUID();
  const createdAt = nowIso();
  const job: ParserJobState = {
    id,
    type: payload.type,
    status: 'queued',
    attempts: 0,
    maxAttempts: env.PARSER_QUEUE_MAX_ATTEMPTS,
    payload,
    result: null,
    error: null,
    deadLetter: false,
    createdAt,
    updatedAt: createdAt,
  };

  jobs.set(id, job);
  queue.push(id);
  processNext();

  return { jobId: id };
};

export const getParserJob = (jobId: string): ParserJobSnapshot | null => {
  const job = jobs.get(jobId);
  return job ? toSnapshot(job) : null;
};

export const waitForParserJob = async (
  jobId: string,
  timeoutMs: number,
): Promise<ParserJobSnapshot | null> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = getParserJob(jobId);
    if (!snapshot) {
      return null;
    }
    if (snapshot.status === 'succeeded' || snapshot.status === 'failed') {
      return snapshot;
    }
    await wait(120);
  }

  return getParserJob(jobId);
};
