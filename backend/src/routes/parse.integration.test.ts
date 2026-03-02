import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createAuthedTestApp } from '../test/testApp';
import { parseRouter } from './parse';

vi.mock('../config/env', () => ({
  env: {
    LOG_LEVEL: 'info',
    GROQ_API_KEY: 'test-groq-key',
    METRICS_ENABLED: false,
    METRICS_WINDOW_MS: 300000,
  },
}));

vi.mock('../services/groqParser', () => ({
  parseBillImageWithGroq: vi.fn(async () => null),
  parseBillTextWithGroq: vi.fn(async () => null),
}));

describe('parseRouter failure behavior integration', () => {
  const app = createAuthedTestApp('/api/parse', parseRouter);

  it('returns 422 when bill text cannot be parsed', async () => {
    const response = await request(app).post('/api/parse/bill-text').send({
      text: 'random unreadable text',
    });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('Unable to parse OCR text');
  });

  it('returns 422 when bill image cannot be parsed', async () => {
    const response = await request(app).post('/api/parse/bill-image').send({
      imageDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7nG5EAAAAASUVORK5CYII=',
    });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('Unable to parse bill image');
  });
});
