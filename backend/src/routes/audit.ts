// ===========================================
// AUDIT ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { queryAuditLogs } from '@/services/audit/index.js';

const logger = createLogger('audit-routes');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  action: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  teamId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

// ===========================================
// ROUTES
// ===========================================

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================
  // GET USER'S AUDIT LOGS
  // ===========================================
  app.get('/', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const query = querySchema.parse(request.query);

    const result = await queryAuditLogs({
      userId,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      action: query.action,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      limit: query.limit,
    });

    return reply.send({
      success: true,
      data: result,
    });
  });

  // ===========================================
  // GET PROJECT AUDIT LOGS
  // ===========================================
  app.get('/projects/:projectId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    const query = querySchema.parse(request.query);

    // Verify user has access to project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId },
          { team: { members: { some: { userId } } } },
        ],
      },
    });

    if (!project) {
      return reply.status(404).send({
        success: false,
        error: 'Project not found or access denied',
      });
    }

    // Get all related resource types for this project
    const result = await queryAuditLogs({
      resourceId: projectId,
      action: query.action,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      limit: query.limit,
    });

    return reply.send({
      success: true,
      data: result,
    });
  });

  // ===========================================
  // GET TEAM AUDIT LOGS
  // ===========================================
  app.get('/teams/:teamId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { teamId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { teamId } = request.params;
    const query = querySchema.parse(request.query);

    // Verify user has access to team (must be admin or owner)
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } },
        ],
      },
    });

    if (!team) {
      return reply.status(403).send({
        success: false,
        error: 'Team not found or insufficient permissions',
      });
    }

    const result = await queryAuditLogs({
      resourceType: 'team',
      resourceId: teamId,
      action: query.action,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      limit: query.limit,
    });

    return reply.send({
      success: true,
      data: result,
    });
  });

  // ===========================================
  // GET AUDIT LOG STATISTICS
  // ===========================================
  app.get('/stats', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { startDate, endDate } = querySchema.parse(request.query);

    const where: Record<string, unknown> = { userId };
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
    }

    // Get action counts
    const actionCounts = await prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } },
      take: 10,
    });

    // Get resource type counts
    const resourceTypeCounts = await prisma.auditLog.groupBy({
      by: ['resourceType'],
      where,
      _count: { resourceType: true },
      orderBy: { _count: { resourceType: 'desc' } },
    });

    // Get recent activity (last 7 days by day)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentLogs = await prisma.auditLog.findMany({
      where: {
        userId,
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        createdAt: true,
      },
    });

    // Group by day
    const activityByDay = recentLogs.reduce((acc, log) => {
      const day = log.createdAt.toISOString().split('T')[0];
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return reply.send({
      success: true,
      data: {
        actionCounts: actionCounts.map((a) => ({
          action: a.action,
          count: a._count.action,
        })),
        resourceTypeCounts: resourceTypeCounts.map((r) => ({
          resourceType: r.resourceType,
          count: r._count.resourceType,
        })),
        activityByDay,
        totalLogs: await prisma.auditLog.count({ where }),
      },
    });
  });

  logger.info('Audit routes registered');
}
