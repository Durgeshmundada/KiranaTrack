import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import path from 'path';

// Load test env before Vitest loads any test files or project modules.
// This ensures modules that validate process.env at import-time (like src/config/env.ts)
// see the test values and don't fail.
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});
