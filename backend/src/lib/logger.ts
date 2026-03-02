// ===========================================
// ZYPHRON LOGGER
// Pino-based structured logging
// ===========================================

import { pino } from 'pino';
import { config } from '@/config/index.js';

// ===========================================
// CREATE LOGGER INSTANCE
// ===========================================

export const logger = pino({
  level: config.logLevel,
  
  // Base fields included in every log
  base: {
    service: 'zyphron-api',
    env: config.env,
  },
  
  // Pretty print in development
  transport: config.env === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
  
  // Serializers for common objects
  serializers: {
    req: (req: { method?: unknown; url?: unknown; headers?: Record<string, unknown> }) => ({
      method: req.method,
      url: req.url,
      headers: {
        host: req.headers?.host,
        'user-agent': req.headers?.['user-agent'],
        'x-request-id': req.headers?.['x-request-id'],
      },
    }),
    res: (res: { statusCode?: number }) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
  
  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ===========================================
// CHILD LOGGERS FOR SERVICES
// ===========================================

export const createLogger = (name: string) => {
  return logger.child({ module: name });
};

// Pre-configured child loggers
export const apiLogger = createLogger('api');
export const dbLogger = createLogger('database');
export const buildLogger = createLogger('build');
export const deployLogger = createLogger('deploy');
export const kafkaLogger = createLogger('kafka');
export const redisLogger = createLogger('redis');

// ===========================================
// LOG HELPERS
// ===========================================

export const logRequest = (req: {
  method: string;
  url: string;
  id?: string;
  userId?: string;
}) => {
  apiLogger.info({
    requestId: req.id,
    method: req.method,
    url: req.url,
    userId: req.userId,
  }, 'Incoming request');
};

export const logResponse = (req: {
  method: string;
  url: string;
  id?: string;
}, res: {
  statusCode: number;
}, responseTime: number) => {
  const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
  
  apiLogger[level]({
    requestId: req.id,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
  }, 'Request completed');
};

export const logError = (error: Error, context?: Record<string, unknown>) => {
  logger.error({
    err: error,
    ...context,
  }, error.message);
};

export const logDeployment = (deploymentId: string, status: string, details?: Record<string, unknown>) => {
  deployLogger.info({
    deploymentId,
    status,
    ...details,
  }, `Deployment ${status}`);
};

export const logBuild = (deploymentId: string, stage: string, details?: Record<string, unknown>) => {
  buildLogger.info({
    deploymentId,
    stage,
    ...details,
  }, `Build ${stage}`);
};
