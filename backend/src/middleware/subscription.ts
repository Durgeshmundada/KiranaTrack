import type { NextFunction, Request, Response } from 'express';

import { assertSubscriptionAllowsWrite } from '../services/subscription';
import { getAuthUserId } from '../utils/authContext';

const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const isSubscriptionRoute = (path: string): boolean =>
  path === '/api/subscription' || path.startsWith('/api/subscription/');

export const subscriptionWriteGuard = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!writeMethods.has(req.method) || isSubscriptionRoute(req.path)) {
    next();
    return;
  }

  void (async () => {
    await assertSubscriptionAllowsWrite(getAuthUserId(req));
    next();
  })().catch(next);
};
