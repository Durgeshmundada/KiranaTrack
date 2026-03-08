import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';
import dns from 'node:dns';

import { env } from '../config/env';
import { logError, logInfo, logWarn } from '../observability/logger';
import { recordDbErrorMetric, recordDbQueryMetric } from '../observability/metrics';

// Render free instances frequently fail on IPv6 routes; prefer IPv4 DB records.
dns.setDefaultResultOrder('ipv4first');

export type DatabaseState =
  | 'connected'
  | 'connecting'
  | 'disconnecting'
  | 'disconnected';

let state: DatabaseState = 'disconnected';

const connectionString = env.SUPABASE_DB_POOL_URL ?? env.SUPABASE_DB_URL;

const pool = new Pool({
  connectionString,
  max: env.DB_POOL_MAX,
  connectionTimeoutMillis: env.DB_CONN_TIMEOUT_MS,
  query_timeout: env.DB_QUERY_TIMEOUT_MS,
  statement_timeout: env.DB_QUERY_TIMEOUT_MS,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  ssl: {
    rejectUnauthorized: env.NODE_ENV === 'production',
  },
});

pool.on('connect', () => {
  state = 'connected';
  logInfo('db.pool.connected');
});

pool.on('remove', () => {
  if (state !== 'disconnecting') {
    state = 'disconnected';
  }
  logInfo('db.pool.client_removed');
});

pool.on('error', (error) => {
  if (state !== 'disconnecting') {
    state = 'disconnected';
  }
  recordDbErrorMetric('pool_error');
  logError('db.pool.error', {
    error: error instanceof Error ? error.message : String(error),
  });
});

export const connectDatabase = async (): Promise<void> => {
  state = 'connecting';
  const client = await pool.connect();
  try {
    await client.query('select 1');
    state = 'connected';
    logInfo('db.connect.success');
  } catch (error) {
    state = 'disconnected';
    recordDbErrorMetric('connect_error');
    logError('db.connect.failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
  }
};

export const getDatabaseState = (): DatabaseState => state;

export const closeDatabase = async (): Promise<void> => {
  state = 'disconnecting';
  await pool.end();
  state = 'disconnected';
  logInfo('db.pool.closed');
};

type Queryable = Pool | PoolClient;

const getQueryable = (client?: PoolClient): Queryable => client ?? pool;

export const dbQuery = async <T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
  client?: PoolClient,
): Promise<QueryResult<T>> => {
  const startedAtNs = process.hrtime.bigint();
  try {
    const result = await getQueryable(client).query<T>(text, values);
    const durationMs = Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
    recordDbQueryMetric({ durationMs, result: 'ok' });
    return result;
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
    recordDbQueryMetric({ durationMs, result: 'error' });
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? 'query_error')
        : 'query_error';
    recordDbErrorMetric(code);
    logWarn('db.query.failed', {
      durationMs: Math.round(durationMs),
      code,
      statementPreview: text.slice(0, 120),
    });
    throw error;
  }
};

export const withTransaction = async <T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch (rollbackError) {
      recordDbErrorMetric('rollback_failed');
      logError('db.transaction.rollback_failed', {
        error:
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
      });
    }
    throw error;
  } finally {
    client.release();
  }
};
