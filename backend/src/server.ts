import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { env } from './config/env';
import { closeDatabase, connectDatabase, getDatabaseState } from './db/postgres';
import { authMiddleware } from './middleware/auth';
import { analyticsRouter } from './routes/analytics';
import { billsRouter } from './routes/bills';
import { outOfStockRouter } from './routes/outofstock';
import { parseRouter } from './routes/parse';
import { paymentsRouter } from './routes/payments';
import { udhaarRouter } from './routes/udhaar';
import { vendorsRouter } from './routes/vendors';
import { errorMiddleware } from './utils/http';

const app = express();
app.set('trust proxy', 1);

app.use((req, res, next) => {
  const requestId = randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  }),
);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
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
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/detailed', (_req, res) => {
  res.status(200).json({
    success: true,
    service: 'kiranatrack-backend',
    timestamp: new Date().toISOString(),
    dbState: getDatabaseState(),
  });
});

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

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}. Shutting down gracefully...`);

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

const start = async (): Promise<void> => {
  await connectDatabase();
  httpServer = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`KiranaTrack backend running on http://localhost:${env.PORT}`);
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', error);
  process.exit(1);
});
