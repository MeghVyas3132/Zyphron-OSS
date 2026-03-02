import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { createAuditLog, queryAuditLogs } from '@/services/audit/index.js';
import { publishEvent } from '@/lib/redis.js';
import { sendDeploymentEvent } from '@/lib/kafka.js';

const logger = createLogger('admin-routes');

const listUsersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  isActive: z.coerce.boolean().optional(),
});

const listDeploymentsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['QUEUED', 'BUILDING', 'DEPLOYING', 'LIVE', 'FAILED', 'CANCELLED', 'ROLLING_BACK']).optional(),
  environment: z.enum(['PRODUCTION', 'PREVIEW', 'STAGING', 'DEVELOPMENT']).optional(),
  userId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

const setUserRoleSchema = z.object({
  role: z.enum(['ADMIN', 'USER']),
});

const setUserStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().max(500).optional(),
});

const revokeUserSchema = z.object({
  reason: z.string().max(500).optional(),
});

const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

const deploymentIdParamsSchema = z.object({
  deploymentId: z.string().uuid(),
});

const listActivityQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users', {
    onRequest: [app.authenticate, app.requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listUsersQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where = {
      ...(query.search ? {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' as const } },
          { name: { contains: query.search, mode: 'insensitive' as const } },
        ],
      } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          _count: {
            select: {
              projects: true,
              deployments: true,
              apiKeys: true,
              auditLogs: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: {
        users,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      },
    });
  });

  app.patch('/users/:userId/role', {
    onRequest: [app.authenticate, app.requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = userIdParamsSchema.parse(request.params);
    const body = setUserRoleSchema.parse(request.body);
    const actorId = request.user?.id as string;

    if (actorId === userId && body.role !== 'ADMIN') {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_OPERATION',
          message: 'Cannot remove your own admin role',
        },
      });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: body.role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    await createAuditLog({
      userId: actorId,
      action: 'admin.user.role_update',
      resourceType: 'user',
      resourceId: userId,
      metadata: {
        previousRole: existing.role,
        newRole: body.role,
      },
      request,
    });

    logger.info({ actorId, userId, role: body.role }, 'User role updated by admin');
    return reply.send({ success: true, data: { user: updated } });
  });

  app.patch('/users/:userId/status', {
    onRequest: [app.authenticate, app.requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = userIdParamsSchema.parse(request.params);
    const body = setUserStatusSchema.parse(request.body);
    const actorId = request.user?.id as string;

    if (actorId === userId && body.isActive === false) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_OPERATION',
          message: 'Cannot disable your own account',
        },
      });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: body.isActive },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    await createAuditLog({
      userId: actorId,
      action: 'admin.user.status_update',
      resourceType: 'user',
      resourceId: userId,
      metadata: {
        previousStatus: existing.isActive,
        newStatus: body.isActive,
        reason: body.reason,
      },
      request,
    });

    logger.info({ actorId, userId, isActive: body.isActive }, 'User status updated by admin');
    return reply.send({ success: true, data: { user: updated } });
  });

  app.post('/users/:userId/revoke', {
    onRequest: [app.authenticate, app.requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = userIdParamsSchema.parse(request.params);
    const actorId = request.user?.id as string;
    const body = revokeUserSchema.parse(request.body ?? {});

    if (actorId === userId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_OPERATION',
          message: 'Cannot revoke your own account',
        },
      });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    const activeDeployments = await prisma.deployment.findMany({
      where: {
        userId,
        status: { in: ['QUEUED', 'BUILDING', 'DEPLOYING'] },
      },
      select: { id: true },
    });

    const activeDeploymentIds = activeDeployments.map((d) => d.id);
    const now = new Date();

    const [disabledUser, cancelledDeployments, revokedApiKeys] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { isActive: false, role: 'USER' },
        select: { id: true, email: true, role: true, isActive: true },
      }),
      prisma.deployment.updateMany({
        where: {
          id: { in: activeDeploymentIds },
        },
        data: {
          status: 'CANCELLED',
          completedAt: now,
          errorCode: 'ADMIN_REVOKED',
          errorMessage: body.reason || 'User access revoked by administrator',
        },
      }),
      prisma.apiKey.deleteMany({
        where: { userId },
      }),
    ]);

    if (activeDeploymentIds.length > 0) {
      await prisma.buildJob.updateMany({
        where: {
          deploymentId: { in: activeDeploymentIds },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          completedAt: now,
          error: body.reason || 'Cancelled due to admin revocation',
        },
      });
    }

    await Promise.all(activeDeploymentIds.map(async (deploymentId) => {
      await publishEvent('deployment:cancelled', { deploymentId, reason: 'admin-revocation' });
      try {
        await sendDeploymentEvent(deploymentId, 'DEPLOYMENT_CANCELLED', {
          deploymentId,
          reason: body.reason || 'Cancelled by administrator',
          userId,
        });
      } catch (error) {
        logger.warn({ deploymentId, error }, 'Failed to publish admin cancellation event to Kafka');
      }
    }));

    await createAuditLog({
      userId: actorId,
      action: 'admin.user.revoke_all',
      resourceType: 'user',
      resourceId: userId,
      metadata: {
        reason: body.reason,
        cancelledDeployments: cancelledDeployments.count,
        revokedApiKeys: revokedApiKeys.count,
      },
      request,
    });

    logger.warn({ actorId, userId }, 'Admin revoked user access and active assets');
    return reply.send({
      success: true,
      data: {
        user: disabledUser,
        summary: {
          cancelledDeployments: cancelledDeployments.count,
          revokedApiKeys: revokedApiKeys.count,
        },
      },
    });
  });

  app.get('/users/:userId/deployments', {
    onRequest: [app.authenticate, app.requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = userIdParamsSchema.parse(request.params);
    const query = listDeploymentsQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.environment ? { environment: query.environment } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
    };

    const [deployments, total] = await Promise.all([
      prisma.deployment.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              userId: true,
            },
          },
          buildJob: true,
        },
      }),
      prisma.deployment.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: {
        deployments,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      },
    });
  });

  app.get('/deployments', {
    onRequest: [app.authenticate, app.requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listDeploymentsQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.environment ? { environment: query.environment } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
    };

    const [deployments, total] = await Promise.all([
      prisma.deployment.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              userId: true,
            },
          },
          buildJob: true,
        },
      }),
      prisma.deployment.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: {
        deployments,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      },
    });
  });

  app.post('/deployments/:deploymentId/cancel', {
    onRequest: [app.authenticate, app.requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { deploymentId } = deploymentIdParamsSchema.parse(request.params);
    const actorId = request.user?.id as string;

    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { buildJob: true },
    });

    if (!deployment) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'DEPLOYMENT_NOT_FOUND',
          message: 'Deployment not found',
        },
      });
    }

    if (!['QUEUED', 'BUILDING', 'DEPLOYING'].includes(deployment.status)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_DEPLOYMENT_STATE',
          message: `Cannot cancel deployment in status ${deployment.status}`,
        },
      });
    }

    const updated = await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        errorCode: 'ADMIN_CANCELLED',
        errorMessage: 'Deployment cancelled by administrator',
      },
    });

    if (deployment.buildJob) {
      await prisma.buildJob.update({
        where: { id: deployment.buildJob.id },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
          error: 'Cancelled by administrator',
        },
      });
    }

    await publishEvent('deployment:cancelled', { deploymentId, reason: 'admin-cancelled' });
    await createAuditLog({
      userId: actorId,
      action: 'admin.deployment.cancel',
      resourceType: 'deployment',
      resourceId: deploymentId,
      metadata: { targetUserId: deployment.userId, projectId: deployment.projectId },
      request,
    });

    return reply.send({
      success: true,
      data: { deployment: updated },
    });
  });

  app.get('/activity', {
    onRequest: [app.authenticate, app.requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listActivityQuerySchema.parse(request.query);
    const result = await queryAuditLogs(query);

    return reply.send({
      success: true,
      data: result,
    });
  });

  logger.info('Admin routes registered');
}
