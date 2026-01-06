// ===========================================
// API KEYS ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { nanoid } from 'nanoid';
import { createHash, randomBytes } from 'crypto';

const logger = createLogger('api-keys');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresInDays: z.number().min(1).max(365).optional(), // Optional expiration in days
});

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Generate a secure API key
 * Format: zk_<prefix>_<secret>
 * prefix: 8 chars for identification
 * secret: 32 chars random
 */
function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = nanoid(8);
  const secret = randomBytes(24).toString('base64url');
  const key = `zk_${prefix}_${secret}`;
  
  // Hash the full key for storage
  const hash = createHash('sha256').update(key).digest('hex');
  
  return { key, prefix, hash };
}

/**
 * Hash an API key for comparison
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ===========================================
// ROUTES
// ===========================================

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================
  // LIST API KEYS
  // ===========================================
  app.get('/', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const query = querySchema.parse(request.query);

    const [apiKeys, total] = await Promise.all([
      prisma.apiKey.findMany({
        where: { userId },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          prefix: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
          // Never return the hash
        },
      }),
      prisma.apiKey.count({ where: { userId } }),
    ]);

    return reply.send({
      success: true,
      data: {
        apiKeys,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      },
    });
  });

  // ===========================================
  // CREATE API KEY
  // ===========================================
  app.post('/', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const body = createApiKeySchema.parse(request.body);

    // Check max API keys limit (10 per user)
    const existingCount = await prisma.apiKey.count({
      where: { userId },
    });

    if (existingCount >= 10) {
      return reply.status(400).send({
        success: false,
        error: 'Maximum of 10 API keys allowed per user',
      });
    }

    // Generate the key
    const { key, prefix, hash } = generateApiKey();

    // Calculate expiration
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    // Store the key
    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: body.name,
        keyHash: hash,
        prefix,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    logger.info({ userId, keyId: apiKey.id, prefix }, 'API key created');

    // Return the full key ONCE - this is the only time it will be shown
    return reply.status(201).send({
      success: true,
      data: {
        ...apiKey,
        key, // Full key shown only on creation
      },
      message: 'Store this API key safely. It will not be shown again.',
    });
  });

  // ===========================================
  // GET API KEY DETAILS
  // ===========================================
  app.get('/:keyId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { keyId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { keyId } = request.params;

    const apiKey = await prisma.apiKey.findFirst({
      where: { id: keyId, userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    if (!apiKey) {
      return reply.status(404).send({
        success: false,
        error: 'API key not found',
      });
    }

    // Check if expired
    const isExpired = apiKey.expiresAt && apiKey.expiresAt < new Date();

    return reply.send({
      success: true,
      data: {
        ...apiKey,
        isExpired,
      },
    });
  });

  // ===========================================
  // UPDATE API KEY NAME
  // ===========================================
  app.patch('/:keyId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { keyId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { keyId } = request.params;
    const body = z.object({ name: z.string().min(1).max(100) }).parse(request.body);

    const apiKey = await prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!apiKey) {
      return reply.status(404).send({
        success: false,
        error: 'API key not found',
      });
    }

    const updated = await prisma.apiKey.update({
      where: { id: keyId },
      data: { name: body.name },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    logger.info({ userId, keyId }, 'API key renamed');

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // ===========================================
  // DELETE API KEY
  // ===========================================
  app.delete('/:keyId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { keyId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { keyId } = request.params;

    const apiKey = await prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!apiKey) {
      return reply.status(404).send({
        success: false,
        error: 'API key not found',
      });
    }

    await prisma.apiKey.delete({
      where: { id: keyId },
    });

    logger.info({ userId, keyId }, 'API key deleted');

    return reply.send({
      success: true,
      message: 'API key deleted successfully',
    });
  });

  // ===========================================
  // VERIFY API KEY (internal use)
  // ===========================================
  app.post('/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer zk_')) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid API key format',
      });
    }

    const key = authHeader.substring(7); // Remove "Bearer "
    const hash = hashApiKey(key);

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash: hash },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!apiKey) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid API key',
      });
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return reply.status(401).send({
        success: false,
        error: 'API key has expired',
      });
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return reply.send({
      success: true,
      data: {
        userId: apiKey.user.id,
        email: apiKey.user.email,
        name: apiKey.user.name,
        keyId: apiKey.id,
        keyName: apiKey.name,
      },
    });
  });

  logger.info('API key routes registered');
}

// ===========================================
// API KEY AUTHENTICATION MIDDLEWARE
// ===========================================

export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer zk_')) {
    return; // Not an API key, let other auth handle it
  }

  const key = authHeader.substring(7);
  const hash = hashApiKey(key);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: {
      user: true,
    },
  });

  if (!apiKey) {
    reply.status(401).send({
      success: false,
      error: 'Invalid API key',
    });
    return;
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    reply.status(401).send({
      success: false,
      error: 'API key has expired',
    });
    return;
  }

  // Update last used (async, don't await)
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  // Set user on request
  (request as FastifyRequest & { user: { id: string; email: string; name: string | null } }).user = {
    id: apiKey.user.id,
    email: apiKey.user.email,
    name: apiKey.user.name ?? 'Unknown',
  };
}
