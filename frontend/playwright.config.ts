import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3004',
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'off',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true },
    },
  ],
  webServer: [
    {
      // Backend API
      command: 'npm run dev',
      cwd: path.resolve(__dirname, '../backend'),
      port: 3003,
      timeout: 60_000,
      reuseExistingServer: true,
      env: {
        PORT: '3003',
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://zyphron:zyphron_secret@localhost:5433/zyphron?schema=public',
        REDIS_URL: 'redis://localhost:6380',
        KAFKA_ENABLED: 'false',
        JWT_SECRET: 'zyphron-dev-jwt-secret-key-change-in-production-32-chars-min',
        ALLOW_DEV_TOKEN_BYPASS: 'true',
        DEPLOYMENT_MODE: 'docker',
        DOCKER_SOCKET_PATH: '/var/run/docker.sock',
        PROJECTS_DIR: '/tmp/zyphron/projects',
        LOG_LEVEL: 'warn',
      },
    },
    {
      // Frontend Next.js
      command: 'npm run start',
      cwd: path.resolve(__dirname),
      port: 3004,
      timeout: 60_000,
      reuseExistingServer: true,
      env: {
        PORT: '3004',
        NEXT_PUBLIC_API_URL: 'http://localhost:3003',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3004',
      },
    },
  ],
});
