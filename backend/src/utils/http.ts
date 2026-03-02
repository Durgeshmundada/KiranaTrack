import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { logError, logWarn } from '../observability/logger';
import { recordDbErrorMetric } from '../observability/metrics';

export const parseBody = <T>(schema: ZodSchema<T>, body: unknown): T => {
  return schema.parse(body);
};

export const parseQuery = <T>(schema: ZodSchema<T>, query: unknown): T => {
  return schema.parse(query);
};

export const sendOk = <T>(res: Response, payload: T): void => {
  res.status(200).json({ success: true, data: payload });
};

export const sendCreated = <T>(res: Response, payload: T): void => {
  res.status(201).json({ success: true, data: payload });
};

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const notFound = (resource: string): never => {
  throw new HttpError(404, `${resource} not found`);
};

interface PgLikeError {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
}

const isPgError = (error: unknown): error is PgLikeError =>
  Boolean(error && typeof error === 'object' && 'code' in error);

const mapPgError = (error: PgLikeError): HttpError | null => {
  switch (error.code) {
    case '23505': {
      const byConstraint: Record<string, string> = {
        vendors_name_key: 'Vendor with this name already exists',
        ux_vendors_name_ci: 'Vendor with this name already exists',
        ux_vendors_owner_name_ci: 'Vendor with this name already exists',
        bills_vendor_id_bill_number_key: 'Bill number already exists for this vendor',
        ux_bills_vendor_bill_number_active: 'Bill number already exists for this vendor',
        ux_bills_vendor_image_hash: 'This bill image already exists for this vendor',
        ux_bills_owner_vendor_client_request: 'Duplicate bill request detected',
        ux_payments_bill_client_request: 'Duplicate payment request detected',
      };
      return new HttpError(
        409,
        byConstraint[error.constraint ?? ''] ?? 'Duplicate record detected',
      );
    }
    case '23503':
      return new HttpError(409, 'Related record is missing or already removed');
    case '23514':
    case '23502':
    case '22007':
    case '22P02':
      return new HttpError(400, 'Invalid request payload');
    case '40001':
      return new HttpError(409, 'Concurrent update detected. Please retry');
    case '57014':
      return new HttpError(503, 'Operation timed out. Please retry');
    default:
      return null;
  }
};

export const errorMiddleware = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const requestId = req.header('x-request-id') ?? '';
  const requestContext = `${req.method} ${req.originalUrl} requestId=${requestId || 'n/a'}`;

  if (error instanceof HttpError) {
    if (error.statusCode >= 500) {
      logError('http.error', {
        requestContext,
        statusCode: error.statusCode,
        message: error.message,
      });
    }
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      requestId,
    });
    return;
  }

  if (error instanceof ZodError) {
    logWarn('http.validation_error', {
      requestContext,
      issues: error.issues.length,
    });
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      requestId,
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (isPgError(error)) {
    const mapped = mapPgError(error);
    if (mapped) {
      recordDbErrorMetric(error.code ?? 'unknown');
      if (mapped.statusCode >= 500) {
        logError('http.db_error', {
          requestContext,
          statusCode: mapped.statusCode,
          code: error.code ?? 'unknown',
          constraint: error.constraint ?? 'unknown',
        });
      }
      res.status(mapped.statusCode).json({
        success: false,
        message: mapped.message,
        requestId,
      });
      return;
    }
  }

  logError('http.unhandled_error', {
    requestContext,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { error },
  });

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    requestId,
    ...(process.env.NODE_ENV === 'development' && error instanceof Error
      ? { debug: error.message }
      : {}),
  });
};
