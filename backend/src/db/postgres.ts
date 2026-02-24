import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';

import { env } from '../config/env';

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
    rejectUnauthorized: false,
  },
});

pool.on('connect', () => {
  state = 'connected';
});

pool.on('remove', () => {
  if (state !== 'disconnecting') {
    state = 'disconnected';
  }
});

pool.on('error', () => {
  if (state !== 'disconnecting') {
    state = 'disconnected';
  }
});

export const connectDatabase = async (): Promise<void> => {
  state = 'connecting';
  const client = await pool.connect();
  try {
    await client.query('select 1');
    state = 'connected';
  } catch (error) {
    state = 'disconnected';
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
};

type Queryable = Pool | PoolClient;

const getQueryable = (client?: PoolClient): Queryable => client ?? pool;

export const dbQuery = async <T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
  client?: PoolClient,
): Promise<QueryResult<T>> => {
  return getQueryable(client).query<T>(text, values);
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
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};
