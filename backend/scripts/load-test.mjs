const apiBaseUrl = (process.env.LOAD_TEST_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const targetPath = process.env.LOAD_TEST_PATH ?? '/health';
const durationMs = Math.min(Math.max(Number(process.env.LOAD_TEST_DURATION_MS ?? 30000), 5000), 10 * 60 * 1000);
const concurrency = Math.min(Math.max(Number(process.env.LOAD_TEST_CONCURRENCY ?? 20), 1), 300);
const timeoutMs = Math.min(Math.max(Number(process.env.LOAD_TEST_TIMEOUT_MS ?? 8000), 1000), 30000);
const bearerToken = (process.env.LOAD_TEST_BEARER_TOKEN ?? '').trim();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url, init = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const percentile = (samples, quantile) => {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index];
};

const run = async () => {
  const startedAt = Date.now();
  const endAt = startedAt + durationMs;
  const latencies = [];
  let successCount = 0;
  let failureCount = 0;

  const worker = async () => {
    while (Date.now() < endAt) {
      const requestStartedAt = Date.now();
      try {
        const response = await fetchWithTimeout(`${apiBaseUrl}${targetPath}`, {
          method: 'GET',
          headers: bearerToken
            ? {
                Authorization: `Bearer ${bearerToken}`,
              }
            : undefined,
        });
        const elapsed = Date.now() - requestStartedAt;
        latencies.push(elapsed);
        if (response.ok) {
          successCount += 1;
        } else {
          failureCount += 1;
        }
      } catch {
        failureCount += 1;
      }
      await wait(0);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedMs = Date.now() - startedAt;
  const totalRequests = successCount + failureCount;
  const requestsPerSecond = totalRequests > 0 ? Math.round((totalRequests * 1000) / elapsedMs) : 0;
  const p50 = percentile(latencies, 0.5);
  const p95 = percentile(latencies, 0.95);
  const p99 = percentile(latencies, 0.99);
  const errorRate = totalRequests > 0 ? (failureCount / totalRequests) * 100 : 0;

  // eslint-disable-next-line no-console
  console.table([
    {
      target: `${apiBaseUrl}${targetPath}`,
      durationMs: elapsedMs,
      concurrency,
      requests: totalRequests,
      successCount,
      failureCount,
      rps: requestsPerSecond,
      p50,
      p95,
      p99,
      errorRatePct: Number(errorRate.toFixed(2)),
    },
  ]);

  if (p95 > 1200) {
    // eslint-disable-next-line no-console
    console.warn('p95 is high (>1200ms). Tune DB indexes, query plans, and DB_POOL_MAX based on connection saturation.');
  }
  if (errorRate > 1) {
    // eslint-disable-next-line no-console
    console.warn('error rate >1%. Check auth timeouts, DB query timeouts, and upstream availability.');
  }
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`Load test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
