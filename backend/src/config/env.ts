import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  SUPABASE_DB_URL: z.string().min(1, 'SUPABASE_DB_URL is required'),
  SUPABASE_DB_POOL_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_JWT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  CORS_ORIGIN: z.string().default('*'),
  GROQ_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  PARSER_RATE_LIMIT_MAX: z.coerce.number().default(30),
  AUTH_UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(500).max(15000).default(3000),
  AUTH_CACHE_TTL_MS: z.coerce.number().int().min(1000).max(60 * 60 * 1000).default(5 * 60 * 1000),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(20),
  DB_CONN_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(10000),
  GROQ_TIMEOUT_MS: z.coerce.number().default(25000),
  GROQ_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  GROQ_IMAGE_MODEL: z.string().default('meta-llama/llama-4-scout-17b-16e-instruct'),
  GROQ_TEXT_MODEL: z.string().default('llama-3.3-70b-versatile'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => issue.message).join(', ');
  throw new Error(`Invalid environment configuration: ${message}`);
}

export const env = parsed.data;
