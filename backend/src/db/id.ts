import { randomBytes } from 'node:crypto';

export const createObjectId = (): string => randomBytes(12).toString('hex');
