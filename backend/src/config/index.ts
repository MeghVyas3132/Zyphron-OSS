// ===========================================
// ZYPHRON CONFIGURATION
// ===========================================

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from backend/ first, then fall back to project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') }); // project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });    // backend/ (wins if exists)

// Parse comma-separated key arrays (supports multiple keys for rotation)
export const keyArraySchema = (field: string) =>
  z.string().default('').transform((s) =>
    s.split(',').map((k) => k.trim()).filter(Boolean)
  ).refine((arr) => arr.length > 0 || field === 'optional', {
    message: `${field} must have at least one key`,
  });

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
    brokers: z.string().default('localhost:9092').transform((s) => s.split(',')),
    clientId: z.string().default('zyphron'),
    enabled: z.coerce.boolean().default(true),
  }),

  jwt: z.object({
    secret: z.string().min(32),
    expiresIn: z.string().default('7d'),
  }),

  auth: z.object({
    allowDevTokenBypass: z.coerce.boolean().default(false),
    bootstrapAdminEmails: z.string().default('').transform((v) =>
      v.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    ),
  }),

  github: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    callbackUrl: z.string().optional(),
  }),

  google: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    callbackUrl: z.string().optional(),
  }),

  // AI: Groq — multiple keys for rotation
  groq: z.object({
    keys: z.string().default('').transform((s) =>
      s.split(',').map((k) => k.trim()).filter(Boolean)
    ),
    model: z.string().default('llama-3.3-70b-versatile'),
    fallbackModel: z.string().default('llama3-8b-8192'),
  }),

  // Email: Resend — multiple keys for rotation
  resend: z.object({
    keys: z.string().default('').transform((s) =>
      s.split(',').map((k) => k.trim()).filter(Boolean)
    ),
    from: z.string().default('Zyphron <noreply@zyphron.space>'),
    replyTo: z.string().default('support@zyphron.space'),
  }),

  docker: z.object({
    socketPath: z.string().optional(),
    host: z.string().optional(),
    registry: z.string().default('localhost:5000'),
  }),

  deployment: z.object({
    projectsDir: z.string().default('/tmp/zyphron/projects'),
    baseDomain: z.string().default('localhost'),
    maxConcurrentBuilds: z.coerce.number().default(5),
    buildTimeout: z.coerce.number().default(1800),
    useHttps: z.coerce.boolean().default(false),
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

  encryption: z.object({
    key: z.string().default('zyphron-dev-encryption-key-32ch'),
  }),

  prometheus: z.object({
    url: z.string().default('http://localhost:9090'),
  }),
});

const rawConfig = {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  host: process.env.HOST,
  logLevel: process.env.LOG_LEVEL,

  database: { url: process.env.DATABASE_URL },
  redis: { url: process.env.REDIS_URL },

  kafka: {
    brokers: process.env.KAFKA_BROKERS,
    clientId: process.env.KAFKA_CLIENT_ID,
    enabled: process.env.KAFKA_ENABLED ?? 'true',
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

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },

  groq: {
    keys: process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL,
    fallbackModel: process.env.GROQ_FALLBACK_MODEL,
  },

  resend: {
    keys: process.env.RESEND_API_KEYS || process.env.RESEND_API_KEY || '',
    from: process.env.RESEND_FROM,
    replyTo: process.env.RESEND_REPLY_TO,
  },

  docker: {
    socketPath: process.env.DOCKER_SOCKET_PATH,
    host: process.env.DOCKER_HOST,
    registry: process.env.CONTAINER_REGISTRY || process.env.DOCKER_REGISTRY,
  },

  deployment: {
    projectsDir: process.env.PROJECTS_DIR,
    baseDomain: process.env.BASE_DOMAIN,
    maxConcurrentBuilds: process.env.MAX_CONCURRENT_BUILDS,
    buildTimeout: process.env.BUILD_TIMEOUT,
    useHttps: process.env.USE_HTTPS,
  },

  storage: {
    endpoint: process.env.MINIO_ENDPOINT || process.env.STORAGE_ENDPOINT,
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY || process.env.STORAGE_SECRET_KEY,
    bucket: process.env.MINIO_BUCKET || process.env.STORAGE_BUCKET,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },

  prometheus: {
    url: process.env.PROMETHEUS_URL,
  },
};

const parseResult = configSchema.safeParse(rawConfig);

if (!parseResult.success) {
  console.error('❌ Configuration validation failed:');
  console.error(JSON.stringify(parseResult.error.format(), null, 2));
  process.exit(1);
}

export const config = parseResult.data;
export type Config = z.infer<typeof configSchema>;

export const isDevelopment = () => config.env === 'development';
export const isProduction = () => config.env === 'production';
export const isStaging = () => config.env === 'staging';
