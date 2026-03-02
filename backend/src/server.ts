import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { env } from './config/env';
import { closeDatabase, connectDatabase, getDatabaseState } from './db/postgres';
import { authMiddleware } from './middleware/auth';
import { startAlertLoop, stopAlertLoop } from './observability/alerts';
import { logError, logInfo, logWarn } from './observability/logger';
import { recordHttpRequestMetric, renderPrometheusMetrics } from './observability/metrics';
import { analyticsRouter } from './routes/analytics';
import { authRouter } from './routes/auth';
import { billsRouter } from './routes/bills';
import { outOfStockRouter } from './routes/outofstock';
import { parseRouter } from './routes/parse';
import { paymentsRouter } from './routes/payments';
import { udhaarRouter } from './routes/udhaar';
import { vendorsRouter } from './routes/vendors';
import { errorMiddleware } from './utils/http';

const app = express();
app.set('trust proxy', env.TRUST_PROXY);

const corsOriginConfig =
  env.CORS_ORIGIN === '*'
    ? true
    : env.CORS_ORIGIN.split(',')
        .map((value) => value.trim())
        .filter(Boolean);

app.use((req, res, next) => {
  const requestId = randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

app.use((req, res, next) => {
  const startedAtNs = process.hrtime.bigint();
  const requestId = req.header('x-request-id') ?? 'n/a';

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
    const routePattern = req.route?.path;
    const route =
      typeof routePattern === 'string'
        ? `${req.baseUrl || ''}${routePattern || ''}` || req.path
        : req.path;

    recordHttpRequestMetric({
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: elapsedMs,
    });

    const logContext = {
      requestId,
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: Math.round(elapsedMs),
      userAgent: req.get('user-agent') ?? null,
      remoteAddress: req.ip,
    };

    if (res.statusCode >= 500) {
      logError('http.request.completed', logContext);
      return;
    }
    if (res.statusCode >= 400) {
      logWarn('http.request.completed', logContext);
      return;
    }

    logInfo('http.request.completed', logContext);
  });

  next();
});

app.use(
  cors({
    origin: corsOriginConfig,
    credentials: env.CORS_ORIGIN !== '*',
  }),
);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(authMiddleware);

app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    service: 'kiranatrack-backend',
    release: env.RELEASE_VERSION,
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', (req, res) => {
  if (!env.METRICS_ENABLED) {
    res.status(404).json({
      success: false,
      message: 'Not found',
    });
    return;
  }

  if (env.NODE_ENV === 'production') {
    const providedToken = req.header('x-metrics-token');
    if (env.METRICS_TOKEN && providedToken !== env.METRICS_TOKEN) {
      res.status(404).json({
        success: false,
        message: 'Not found',
      });
      return;
    }
  }

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.status(200).send(renderPrometheusMetrics());
});

app.get('/health/detailed', (_req, res) => {
  if (env.NODE_ENV === 'production') {
    const providedToken = _req.header('x-health-token');
    if (!env.HEALTH_DETAILS_TOKEN || providedToken !== env.HEALTH_DETAILS_TOKEN) {
      res.status(404).json({
        success: false,
        message: 'Not found',
      });
      return;
    }
  }

  res.status(200).json({
    success: true,
    service: 'kiranatrack-backend',
    release: env.RELEASE_VERSION,
    timestamp: new Date().toISOString(),
    dbState: getDatabaseState(),
  });
});

app.use(
  '/auth',
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  authRouter,
);
app.use('/api/bills', billsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/outofstock', outOfStockRouter);
app.use('/api/udhaar', udhaarRouter);
app.use('/api/analytics', analyticsRouter);
app.use(
  '/api/parse',
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.PARSER_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  parseRouter,
);

app.use(errorMiddleware);

let httpServer: Server | null = null;
let shuttingDown = false;
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logInfo('server.shutdown.started', { signal });

  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        if (!httpServer) {
          resolve();
          return;
        }

        httpServer.close(() => resolve());
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 8000)),
    ]);
  } finally {
    stopAlertLoop();
    await closeDatabase().catch(() => {});
    process.exit(0);
  }
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('unhandledRejection', (reason) => {
  logError('process.unhandled_rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  logError('process.uncaught_exception', {
    error: error.message,
    stack: error.stack ?? null,
  });
  process.exit(1);
});

const start = async (): Promise<void> => {
  const dbSource = env.SUPABASE_DB_POOL_URL ? 'pooler' : 'direct';
  const authMode = env.SUPABASE_JWT_SECRET ? 'local-jwt' : 'supabase-claims';
  logInfo('server.startup.config', {
    dbSource,
    authMode,
    nodeEnv: env.NODE_ENV,
    release: env.RELEASE_VERSION,
  });

  let connected = false;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= env.DB_CONNECT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await connectDatabase();
      connected = true;
      break;
    } catch (error) {
      lastError = error;
      logError('server.db_connect_attempt.failed', {
        attempt,
        maxAttempts: env.DB_CONNECT_RETRY_ATTEMPTS,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < env.DB_CONNECT_RETRY_ATTEMPTS) {
        await wait(env.DB_CONNECT_RETRY_DELAY_MS * attempt);
      }
    }
  }

  if (!connected) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Database connection failed');
  }

  httpServer = app.listen(env.PORT, () => {
    logInfo('server.started', {
      port: env.PORT,
      localUrl: `http://localhost:${env.PORT}`,
    });
  });

  startAlertLoop();
};

start().catch((error) => {
  logError('server.start_failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
