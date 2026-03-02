// ===========================================
// ZYPHRON CONFIGURATION
// Centralized application configuration
// ===========================================

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ===========================================
// CONFIGURATION SCHEMA
// ===========================================

const configSchema = z.object({
  env: z.enum(['development', 'staging', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  database: z.object({
    url: z.string(),
  }),

  redis: z.object({
    url: z.string().default('redis://localhost:6379'),
  }),

  kafka: z.object({
    brokers: z.string().transform((s) => s.split(',')),
    clientId: z.string().default('zyphron'),
  }),

  jwt: z.object({
    secret: z.string().min(32),
    expiresIn: z.string().default('7d'),
  }),

  auth: z.object({
    allowDevTokenBypass: z.coerce.boolean().default(false),
    bootstrapAdminEmails: z.string().default('').transform((value) =>
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    ),
  }),

  github: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    callbackUrl: z.string().optional(),
  }),

  docker: z.object({
    socketPath: z.string().optional(),
    host: z.string().optional(),
    registry: z.string().default('localhost:5000'),
  }),

  deployment: z.object({
    projectsDir: z.string().default('/var/www/projects'),
    baseDomain: z.string().default('localhost'),
    maxConcurrentBuilds: z.coerce.number().default(5),
    buildTimeout: z.coerce.number().default(1800), // 30 minutes
  }),

  storage: z.object({
    endpoint: z.string().default('http://localhost:9000'),
    accessKey: z.string().default('zyphron_admin'),
    secretKey: z.string().default('zyphron_secret_key'),
    bucket: z.string().default('zyphron-artifacts'),
  }),

  supabase: z.object({
    url: z.string().optional(),
    serviceKey: z.string().optional(),
  }),
});

// ===========================================
// PARSE CONFIGURATION
// ===========================================

const rawConfig = {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  host: process.env.HOST,
  logLevel: process.env.LOG_LEVEL,

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL,
  },

  kafka: {
    brokers: process.env.KAFKA_BROKERS || 'localhost:9092',
    clientId: process.env.KAFKA_CLIENT_ID,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
  },

  auth: {
    allowDevTokenBypass: process.env.ALLOW_DEV_TOKEN_BYPASS,
    bootstrapAdminEmails: process.env.BOOTSTRAP_ADMIN_EMAILS,
  },

  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: process.env.GITHUB_CALLBACK_URL,
  },

  docker: {
    socketPath: process.env.DOCKER_SOCKET_PATH,
    host: process.env.DOCKER_HOST,
    registry: process.env.CONTAINER_REGISTRY,
  },

  deployment: {
    projectsDir: process.env.PROJECTS_DIR,
    baseDomain: process.env.BASE_DOMAIN,
    maxConcurrentBuilds: process.env.MAX_CONCURRENT_BUILDS,
    buildTimeout: process.env.BUILD_TIMEOUT,
  },

  storage: {
    endpoint: process.env.MINIO_ENDPOINT,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
    bucket: process.env.MINIO_BUCKET,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },
};

// ===========================================
// VALIDATE AND EXPORT
// ===========================================

const parseResult = configSchema.safeParse(rawConfig);

if (!parseResult.success) {
  console.error('Configuration validation failed:');
  console.error(parseResult.error.format());
  process.exit(1);
}

export const config = parseResult.data;

export type Config = z.infer<typeof configSchema>;

// ===========================================
// HELPER FUNCTIONS
// ===========================================

export const isDevelopment = () => config.env === 'development';
export const isProduction = () => config.env === 'production';
export const isStaging = () => config.env === 'staging';
