import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

const parseTrustProxy = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') {
      return 1;
    }
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }

    const parsedNumber = Number(normalized);
    if (Number.isInteger(parsedNumber) && parsedNumber >= 0) {
      return parsedNumber;
    }
  }

  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return 1;
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RELEASE_VERSION: z.string().default('local-dev'),
  PORT: z.coerce.number().default(4000),
  SUPABASE_DB_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SUPABASE_DB_POOL_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_JWT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  CORS_ORIGIN: z.string().default('*'),
  TRUST_PROXY: z.preprocess(
    parseTrustProxy,
    z.union([z.boolean(), z.number().int().min(0)]),
  ),
  HEALTH_DETAILS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_WINDOW_MS: z.coerce.number().int().min(60_000).max(60 * 60 * 1000).default(5 * 60 * 1000),
  METRICS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  ALERT_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ALERT_COOLDOWN_MS: z.coerce.number().int().min(60_000).max(60 * 60 * 1000).default(5 * 60 * 1000),
  ALERT_EVALUATION_INTERVAL_MS: z.coerce.number().int().min(10_000).max(10 * 60 * 1000).default(60_000),
  ALERT_P95_LATENCY_MS: z.coerce.number().int().min(50).max(30_000).default(1_500),
  ALERT_AUTH_FAILURES_THRESHOLD: z.coerce.number().int().min(1).max(10_000).default(20),
  ALERT_DB_ERRORS_THRESHOLD: z.coerce.number().int().min(1).max(10_000).default(10),
  ALERT_MIN_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(30),
  AUTH_SIGNUP_ENABLED: z.coerce.boolean().default(false),
  GROQ_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  PARSER_QUEUE_ENABLED: z.coerce.boolean().default(true),
  PARSER_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  PARSER_QUEUE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  PARSER_QUEUE_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(10_000).default(1_000),
  PARSER_SYNC_WAIT_MS: z.coerce.number().int().min(300).max(20_000).default(3_000),
  PARSER_JOB_TTL_MS: z.coerce.number().int().min(60_000).max(24 * 60 * 60 * 1000).default(60 * 60 * 1000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(5).max(300).default(20),
  PARSER_RATE_LIMIT_MAX: z.coerce.number().default(30),
  AUTH_UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(500).max(15000).default(3000),
  AUTH_UPSTREAM_RETRIES: z.coerce.number().int().min(0).max(4).default(1),
  AUTH_UPSTREAM_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(5000).default(300),
  AUTH_CACHE_TTL_MS: z.coerce.number().int().min(1000).max(60 * 60 * 1000).default(5 * 60 * 1000),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(20),
  DB_CONN_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(10000),
  DB_CONNECT_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  DB_CONNECT_RETRY_DELAY_MS: z.coerce.number().int().min(250).max(30000).default(2000),
  GROQ_TIMEOUT_MS: z.coerce.number().default(15000),
  GROQ_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(0),
  GROQ_IMAGE_MODEL: z.string().default('meta-llama/llama-4-scout-17b-16e-instruct'),
  GROQ_IMAGE_FALLBACK_MODELS: z.string().default(''),
  GROQ_TEXT_MODEL: z.string().default('llama-3.3-70b-versatile'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => issue.message).join(', ');
  throw new Error(`Invalid environment configuration: ${message}`);
}

const envData = parsed.data;

if (!envData.SUPABASE_DB_POOL_URL && !envData.SUPABASE_DB_URL) {
  throw new Error('Invalid environment configuration: set SUPABASE_DB_POOL_URL or SUPABASE_DB_URL');
}

if (envData.NODE_ENV === 'production' && !envData.SUPABASE_DB_POOL_URL) {
  throw new Error('Invalid environment configuration: SUPABASE_DB_POOL_URL is required in production');
}

if (envData.NODE_ENV === 'production' && !envData.SUPABASE_JWT_SECRET) {
  throw new Error('Invalid environment configuration: SUPABASE_JWT_SECRET is required in production');
}

if (envData.NODE_ENV === 'production' && envData.CORS_ORIGIN === '*') {
  throw new Error('Invalid environment configuration: CORS_ORIGIN must be explicit in production');
}

export const env = envData;
