import type { Request } from 'express';

import { HttpError } from './http';

type AuthenticatedRequest = Request & {
  authUserId?: string;
  authRole?: 'authenticated';
};

export const getAuthUserId = (req: Request): string => {
  const userId = (req as AuthenticatedRequest).authUserId;
  if (!userId) {
    throw new HttpError(401, 'Authentication required');
  }

  return userId;
};

export const getAuthRole = (
  req: Request,
): 'authenticated' | null => {
  const role = (req as AuthenticatedRequest).authRole;
  return role ?? null;
};
