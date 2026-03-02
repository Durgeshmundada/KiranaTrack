import express, { type Router } from 'express';

import { errorMiddleware } from '../utils/http';

export const createAuthedTestApp = (
  path: string,
  router: Router,
  ownerUserId = '0123456789abcdef01234567',
) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const request = req as typeof req & {
      authUserId?: string;
      authRole?: 'authenticated';
    };
    request.authUserId = ownerUserId;
    request.authRole = 'authenticated';
    next();
  });
  app.use(path, router);
  app.use(errorMiddleware);
  return app;
};
