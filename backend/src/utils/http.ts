import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';

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
        bills_vendor_id_bill_number_key: 'Bill number already exists for this vendor',
        ux_bills_vendor_image_hash: 'This bill image already exists for this vendor',
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

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      requestId,
    });
    return;
  }

  if (error instanceof ZodError) {
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
      res.status(mapped.statusCode).json({
        success: false,
        message: mapped.message,
        requestId,
      });
      return;
    }
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    requestId,
    ...(process.env.NODE_ENV === 'development' && error instanceof Error
      ? { debug: error.message }
      : {}),
  });
};
