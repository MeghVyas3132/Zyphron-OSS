// ===========================================
// ZYPHRON FASTIFY APPLICATION
// ===========================================

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { config } from '@/config/index.js';
import { prisma } from '@/lib/prisma.js';
import { getRedisClient } from '@/lib/redis.js';
import { createAuditLog } from '@/services/audit/index.js';

// Routes
import { healthRoutes } from '@/routes/health.js';
import { authRoutes } from '@/routes/auth.js';
import { githubRoutes } from '@/routes/github.js';
import { aiRoutes } from '@/routes/ai.js';
import { previewRoutes } from '@/routes/previews.js';
import { projectRoutes } from '@/routes/projects.js';
import { deploymentRoutes } from '@/routes/deployments.js';
import { serviceRoutes } from '@/routes/services.js';
import { envRoutes } from '@/routes/env.js';
import { databaseRoutes } from '@/routes/databases.js';
import { webhookRoutes } from '@/routes/webhooks.js';
import { metricsRoutes } from '@/routes/metrics.js';
import { websocketRoutes } from '@/routes/ws.js';
import { domainRoutes } from '@/routes/domains.js';
import { teamRoutes } from '@/routes/teams.js';
import { apiKeyRoutes } from '@/routes/api-keys.js';
import { auditRoutes } from '@/routes/audit.js';
import { cloudRoutes } from '@/routes/cloud.js';
import { strategiesRoutes } from '@/routes/strategies.js';
import { edgeRoutes } from '@/routes/edge.js';
import { observabilityRoutes } from '@/routes/observability.js';
import { chaosRoutes } from '@/routes/chaos.js';
import { dbBranchingRoutes } from '@/routes/db-branching.js';
import selfDeployRoutes from '@/routes/self-deploy.js';
import { adminRoutes } from '@/routes/admin.js';

// ===========================================
// CREATE APPLICATION
// ===========================================

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: config.env === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      } : undefined,
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
  });

  // ===========================================
  // REGISTER PLUGINS
  // ===========================================

  // CORS
  await app.register(cors, {
    origin: config.env === 'production' 
      ? [`https://${config.deployment.baseDomain}`, `https://app.${config.deployment.baseDomain}`]
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: config.env === 'production',
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 hour',
    redis: getRedisClient(),
    keyGenerator: (req: FastifyRequest) => {
      return req.headers['x-forwarded-for']?.toString() || req.ip;
    },
  });

  // JWT authentication
  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.expiresIn,
    },
  });

  // File uploads
  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB
      files: 1,
    },
  });

  // Raw body support for webhook signature verification
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req: { raw: unknown }, body: string, done: (err: Error | null, result?: unknown) => void) => {
      try {
        // Store raw body for signature verification
        (_req as FastifyRequest & { rawBody?: string }).rawBody = body;
        const json = JSON.parse(body);
        done(null, json);
      } catch (err) {
        done(err as Error);
      }
    }
  );

  // WebSocket support
  await app.register(websocket);

  // API Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Zyphron API',
        description: 'Next-Generation Universal Deployment Platform API',
        version: '1.0.0',
      },
      servers: [
        {
          url: config.env === 'production' 
            ? `https://api.${config.deployment.baseDomain}`
            : `http://localhost:${config.port}`,
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // ===========================================
  // AUTHENTICATION DECORATOR
  // ===========================================

  app.decorate('authenticate', async function (
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    // Explicitly opt-in development bypass for local smoke testing
    if (config.env === 'development' && config.auth.allowDevTokenBypass) {
      const authHeader = request.headers.authorization;
      if (authHeader === 'Bearer dev-token') {
        (request as unknown as { user: { id: string; sub: string; email: string; name: string; role: 'ADMIN'; isActive: true } }).user = {
          id: 'dev-user-id',
          sub: 'dev-user-id',
          email: 'dev@zyphron.dev',
          name: 'Dev User',
          role: 'ADMIN',
          isActive: true,
        };
        return;
      }
    }

    try {
      await request.jwtVerify();

      const tokenUser = request.user as unknown as { sub?: string; id?: string };
      const userId = tokenUser.sub || tokenUser.id;
      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid authentication token',
          },
        });
      }

      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          isActive: true,
        },
      });

      if (!currentUser) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User no longer exists',
          },
        });
      }

      if (!currentUser.isActive) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Account is disabled',
          },
        });
      }

      request.user = {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name ?? undefined,
        avatarUrl: currentUser.avatarUrl ?? undefined,
        role: currentUser.role,
        isActive: currentUser.isActive,
      };
    } catch (err) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        },
      });
    }
  });

  app.decorate('requireAdmin', async function (
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    if (request.user?.role !== 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      });
    }
  });

  // ===========================================
  // GLOBAL HOOKS
  // ===========================================

  // Request logging
  app.addHook('onRequest', async (request) => {
    request.log.info({
      url: request.url,
      method: request.method,
      headers: {
        'user-agent': request.headers['user-agent'],
        'x-forwarded-for': request.headers['x-forwarded-for'],
      },
    }, 'Incoming request');
  });

  // Response logging
  app.addHook('onResponse', async (request, reply) => {
    request.log.info({
      url: request.url,
      method: request.method,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'Request completed');

    const mutatingMethod = request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH' || request.method === 'DELETE';
    const isApiRequest = request.url.startsWith('/api/v1/');
    const isExternalWebhook = request.url.startsWith('/api/v1/webhooks/github/');

    if (mutatingMethod && isApiRequest && !isExternalWebhook && request.user?.id) {
      const routePath = request.routeOptions.url ?? request.url.split('?')[0];
      void createAuditLog({
        userId: request.user.id,
        action: `http.${request.method.toLowerCase()}`,
        resourceType: 'api',
        resourceId: routePath,
        metadata: {
          statusCode: reply.statusCode,
          method: request.method,
          route: routePath,
          requestId: request.id,
        },
        request,
      });
    }
  });

  // Error handler
  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error }, 'Request error');

    const statusCode = error.statusCode || 500;
    const response = {
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: config.env === 'production' && statusCode === 500
          ? 'An unexpected error occurred'
          : error.message,
        ...(config.env === 'development' && { stack: error.stack }),
      },
      meta: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
      },
    };

    reply.status(statusCode).send(response);
  });

  // Not found handler
  app.setNotFoundHandler(async (request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  // ===========================================
  // REGISTER ROUTES
  // ===========================================

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(githubRoutes, { prefix: '/api/v1/github' });
  await app.register(aiRoutes, { prefix: '/api/v1/ai' });
  await app.register(previewRoutes, { prefix: '/api/v1/previews' });
  await app.register(projectRoutes, { prefix: '/api/v1/projects' });
  await app.register(deploymentRoutes, { prefix: '/api/v1' });  // Has /projects/:id/deployments and /deployments/:id routes
  await app.register(serviceRoutes, { prefix: '/api/v1' });  // Services under /api/v1/projects/:projectId/services
  await app.register(envRoutes, { prefix: '/api/v1' });
  await app.register(databaseRoutes, { prefix: '/api/v1' });
  await app.register(webhookRoutes, { prefix: '/api/v1' });  // Webhooks under /api/v1/projects/:projectId/webhooks and /api/v1/webhooks/github/:projectId
  await app.register(domainRoutes, { prefix: '/api/v1' });
  await app.register(metricsRoutes, { prefix: '/api/v1' });
  await app.register(teamRoutes, { prefix: '/api/v1/teams' });
  await app.register(apiKeyRoutes, { prefix: '/api/v1/api-keys' });
  await app.register(auditRoutes, { prefix: '/api/v1/audit' });
  await app.register(cloudRoutes, { prefix: '/api/v1/cloud' });
  await app.register(strategiesRoutes, { prefix: '/api/v1' });
  await app.register(edgeRoutes, { prefix: '/api/v1/edge' });
  await app.register(observabilityRoutes, { prefix: '/api/v1/observability' });
  await app.register(chaosRoutes, { prefix: '/api/v1/chaos' });
  await app.register(dbBranchingRoutes, { prefix: '/api/v1' });
  await app.register(selfDeployRoutes, { prefix: '/api/v1/self-deploy' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(websocketRoutes);

  return app;
}

// ===========================================
// TYPE AUGMENTATION
// ===========================================

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
