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

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    requestId,
    ...(process.env.NODE_ENV === 'development' && error instanceof Error
      ? { debug: error.message }
      : {}),
  });
};
