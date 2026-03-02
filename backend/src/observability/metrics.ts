import { env } from '../config/env';

type TaggedCounter = Map<string, number>;

type TimedSample = {
  value: number;
  timestampMs: number;
};

const HTTP_COUNTER = new Map<string, number>();
const AUTH_FAILURE_COUNTER = new Map<string, number>();
const DB_ERROR_COUNTER = new Map<string, number>();
const DB_QUERY_COUNTER = new Map<string, number>();

const REQUEST_LATENCY_SAMPLES: TimedSample[] = [];
const DB_QUERY_LATENCY_SAMPLES: TimedSample[] = [];
const AUTH_FAILURE_TIMESTAMPS: number[] = [];
const DB_ERROR_TIMESTAMPS: number[] = [];

const MAX_SAMPLE_SIZE = 10_000;

const toMetricKey = (parts: Record<string, string | number>): string =>
  Object.entries(parts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('|');

const increment = (counter: TaggedCounter, key: string): void => {
  counter.set(key, (counter.get(key) ?? 0) + 1);
};

const addSample = (target: TimedSample[], value: number): void => {
  target.push({
    value,
    timestampMs: Date.now(),
  });

  if (target.length > MAX_SAMPLE_SIZE) {
    target.splice(0, target.length - MAX_SAMPLE_SIZE);
  }
};

const addTimestamp = (target: number[]): void => {
  target.push(Date.now());
  if (target.length > MAX_SAMPLE_SIZE) {
    target.splice(0, target.length - MAX_SAMPLE_SIZE);
  }
};

const percentile = (samples: TimedSample[], quantile: number): number => {
  if (samples.length === 0) {
    return 0;
  }

  const sorted = samples.map((entry) => entry.value).sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index];
};

const windowStart = (): number => Date.now() - env.METRICS_WINDOW_MS;

const pruneWindowedSamples = (): void => {
  const minTimestamp = windowStart();

  while (
    REQUEST_LATENCY_SAMPLES.length > 0 &&
    REQUEST_LATENCY_SAMPLES[0].timestampMs < minTimestamp
  ) {
    REQUEST_LATENCY_SAMPLES.shift();
  }

  while (
    DB_QUERY_LATENCY_SAMPLES.length > 0 &&
    DB_QUERY_LATENCY_SAMPLES[0].timestampMs < minTimestamp
  ) {
    DB_QUERY_LATENCY_SAMPLES.shift();
  }

  while (AUTH_FAILURE_TIMESTAMPS.length > 0 && AUTH_FAILURE_TIMESTAMPS[0] < minTimestamp) {
    AUTH_FAILURE_TIMESTAMPS.shift();
  }

  while (DB_ERROR_TIMESTAMPS.length > 0 && DB_ERROR_TIMESTAMPS[0] < minTimestamp) {
    DB_ERROR_TIMESTAMPS.shift();
  }
};

export const recordHttpRequestMetric = (params: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}): void => {
  if (!env.METRICS_ENABLED) {
    return;
  }

  increment(
    HTTP_COUNTER,
    toMetricKey({
      method: params.method.toUpperCase(),
      route: params.route,
      status: params.statusCode,
    }),
  );
  addSample(REQUEST_LATENCY_SAMPLES, params.durationMs);
};

export const recordAuthFailureMetric = (reason: string): void => {
  if (!env.METRICS_ENABLED) {
    return;
  }

  increment(
    AUTH_FAILURE_COUNTER,
    toMetricKey({
      reason,
    }),
  );
  addTimestamp(AUTH_FAILURE_TIMESTAMPS);
};

export const recordDbErrorMetric = (code: string): void => {
  if (!env.METRICS_ENABLED) {
    return;
  }

  increment(
    DB_ERROR_COUNTER,
    toMetricKey({
      code,
    }),
  );
  addTimestamp(DB_ERROR_TIMESTAMPS);
};

export const recordDbQueryMetric = (params: {
  durationMs: number;
  result: 'ok' | 'error';
}): void => {
  if (!env.METRICS_ENABLED) {
    return;
  }

  increment(
    DB_QUERY_COUNTER,
    toMetricKey({
      result: params.result,
    }),
  );
  addSample(DB_QUERY_LATENCY_SAMPLES, params.durationMs);
};

const mapToSortedEntries = (counter: TaggedCounter): Array<{ key: string; value: number }> =>
  [...counter.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => left.key.localeCompare(right.key));

export const getMetricsSnapshot = (): {
  windowMs: number;
  requests: {
    samples: number;
    p95LatencyMs: number;
  };
  authFailures: {
    total: number;
    windowCount: number;
  };
  dbErrors: {
    total: number;
    windowCount: number;
  };
  dbQueries: {
    samples: number;
    p95LatencyMs: number;
  };
} => {
  pruneWindowedSamples();

  const totalAuthFailures = [...AUTH_FAILURE_COUNTER.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalDbErrors = [...DB_ERROR_COUNTER.values()].reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    windowMs: env.METRICS_WINDOW_MS,
    requests: {
      samples: REQUEST_LATENCY_SAMPLES.length,
      p95LatencyMs: Math.round(percentile(REQUEST_LATENCY_SAMPLES, 0.95)),
    },
    authFailures: {
      total: totalAuthFailures,
      windowCount: AUTH_FAILURE_TIMESTAMPS.length,
    },
    dbErrors: {
      total: totalDbErrors,
      windowCount: DB_ERROR_TIMESTAMPS.length,
    },
    dbQueries: {
      samples: DB_QUERY_LATENCY_SAMPLES.length,
      p95LatencyMs: Math.round(percentile(DB_QUERY_LATENCY_SAMPLES, 0.95)),
    },
  };
};

const parseMetricKey = (key: string): Record<string, string> => {
  const parts = key.split('|');
  const parsed: Record<string, string> = {};
  parts.forEach((part) => {
    const [left, right] = part.split('=');
    if (left && right !== undefined) {
      parsed[left] = right;
    }
  });
  return parsed;
};

const withLabels = (name: string, labels: Record<string, string>, value: number): string => {
  const keys = Object.keys(labels);
  if (keys.length === 0) {
    return `${name} ${value}`;
  }

  const serializedLabels = keys
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${key}="${labels[key].replaceAll('"', '\\"')}"`)
    .join(',');

  return `${name}{${serializedLabels}} ${value}`;
};

export const renderPrometheusMetrics = (): string => {
  if (!env.METRICS_ENABLED) {
    return '# metrics disabled';
  }

  const snapshot = getMetricsSnapshot();
  const lines: string[] = [];

  lines.push('# HELP kiranatrack_http_request_latency_p95_ms p95 latency for HTTP requests in rolling window.');
  lines.push('# TYPE kiranatrack_http_request_latency_p95_ms gauge');
  lines.push(
    withLabels('kiranatrack_http_request_latency_p95_ms', {}, snapshot.requests.p95LatencyMs),
  );

  lines.push('# HELP kiranatrack_http_requests_total HTTP requests by method, route, status.');
  lines.push('# TYPE kiranatrack_http_requests_total counter');
  mapToSortedEntries(HTTP_COUNTER).forEach((entry) => {
    lines.push(
      withLabels(
        'kiranatrack_http_requests_total',
        parseMetricKey(entry.key),
        entry.value,
      ),
    );
  });

  lines.push('# HELP kiranatrack_auth_failures_total Authentication failures by reason.');
  lines.push('# TYPE kiranatrack_auth_failures_total counter');
  mapToSortedEntries(AUTH_FAILURE_COUNTER).forEach((entry) => {
    lines.push(
      withLabels(
        'kiranatrack_auth_failures_total',
        parseMetricKey(entry.key),
        entry.value,
      ),
    );
  });

  lines.push('# HELP kiranatrack_auth_failures_window Current auth failures in rolling window.');
  lines.push('# TYPE kiranatrack_auth_failures_window gauge');
  lines.push(
    withLabels('kiranatrack_auth_failures_window', {}, snapshot.authFailures.windowCount),
  );

  lines.push('# HELP kiranatrack_db_errors_total DB errors by code.');
  lines.push('# TYPE kiranatrack_db_errors_total counter');
  mapToSortedEntries(DB_ERROR_COUNTER).forEach((entry) => {
    lines.push(
      withLabels('kiranatrack_db_errors_total', parseMetricKey(entry.key), entry.value),
    );
  });

  lines.push('# HELP kiranatrack_db_errors_window Current DB errors in rolling window.');
  lines.push('# TYPE kiranatrack_db_errors_window gauge');
  lines.push(withLabels('kiranatrack_db_errors_window', {}, snapshot.dbErrors.windowCount));

  lines.push('# HELP kiranatrack_db_query_latency_p95_ms p95 DB query latency in rolling window.');
  lines.push('# TYPE kiranatrack_db_query_latency_p95_ms gauge');
  lines.push(
    withLabels('kiranatrack_db_query_latency_p95_ms', {}, snapshot.dbQueries.p95LatencyMs),
  );

  lines.push('# HELP kiranatrack_db_queries_total DB queries by result status.');
  lines.push('# TYPE kiranatrack_db_queries_total counter');
  mapToSortedEntries(DB_QUERY_COUNTER).forEach((entry) => {
    lines.push(
      withLabels('kiranatrack_db_queries_total', parseMetricKey(entry.key), entry.value),
    );
  });

  return `${lines.join('\n')}\n`;
};
