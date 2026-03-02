// ===========================================
// METRICS ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { getRedisClient } from '@/lib/redis.js';
import { projectWhereForUser } from '@/lib/project-access.js';

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const timeRangeSchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  period: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
});

const projectMetricsSchema = z.object({
  metrics: z.array(z.enum([
    'deployments',
    'builds',
    'requests',
    'bandwidth',
    'errors',
    'latency',
    'cpu',
    'memory',
  ])).optional(),
  period: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function getPeriodMs(period: string): number {
  switch (period) {
    case '1h': return 60 * 60 * 1000;
    case '6h': return 6 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    case '30d': return 30 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

// ===========================================
// ROUTES
// ===========================================

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================
  // PROMETHEUS METRICS ENDPOINT
  // ===========================================

  // Prometheus scrape endpoint (no auth for Prometheus)
  app.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    const redis = getRedisClient();
    
    // Collect metrics
    const metrics: string[] = [];

    // Application metrics
    const now = Date.now();
    
    // Total deployments
    const totalDeployments = await prisma.deployment.count();
    metrics.push(`# HELP zyphron_deployments_total Total number of deployments`);
    metrics.push(`# TYPE zyphron_deployments_total counter`);
    metrics.push(`zyphron_deployments_total ${totalDeployments}`);

    // Deployments by status
    const deploymentsByStatus = await prisma.deployment.groupBy({
      by: ['status'],
      _count: true,
    });
    metrics.push(`# HELP zyphron_deployments_by_status Deployments by status`);
    metrics.push(`# TYPE zyphron_deployments_by_status gauge`);
    for (const d of deploymentsByStatus) {
      metrics.push(`zyphron_deployments_by_status{status="${d.status}"} ${d._count}`);
    }

    // Total projects
    const totalProjects = await prisma.project.count();
    metrics.push(`# HELP zyphron_projects_total Total number of projects`);
    metrics.push(`# TYPE zyphron_projects_total gauge`);
    metrics.push(`zyphron_projects_total ${totalProjects}`);

    // Total users
    const totalUsers = await prisma.user.count();
    metrics.push(`# HELP zyphron_users_total Total number of users`);
    metrics.push(`# TYPE zyphron_users_total gauge`);
    metrics.push(`zyphron_users_total ${totalUsers}`);

    // Databases by type
    const databasesByType = await prisma.database.groupBy({
      by: ['type'],
      _count: true,
    });
    metrics.push(`# HELP zyphron_databases_by_type Databases by type`);
    metrics.push(`# TYPE zyphron_databases_by_type gauge`);
    for (const db of databasesByType) {
      metrics.push(`zyphron_databases_by_type{type="${db.type}"} ${db._count}`);
    }

    // Active deployments (running)
    const activeDeployments = await prisma.deployment.count({
      where: { status: 'LIVE' },
    });
    metrics.push(`# HELP zyphron_active_deployments Current active deployments`);
    metrics.push(`# TYPE zyphron_active_deployments gauge`);
    metrics.push(`zyphron_active_deployments ${activeDeployments}`);

    // Pending deployments
    const pendingDeployments = await prisma.deployment.count({
      where: { status: { in: ['QUEUED', 'BUILDING', 'DEPLOYING'] } },
    });
    metrics.push(`# HELP zyphron_pending_deployments Current pending deployments`);
    metrics.push(`# TYPE zyphron_pending_deployments gauge`);
    metrics.push(`zyphron_pending_deployments ${pendingDeployments}`);

    // Redis metrics (if available)
    try {
      const redisInfo = await redis.info('memory');
      const usedMemory = redisInfo.match(/used_memory:(\d+)/)?.[1];
      if (usedMemory) {
        metrics.push(`# HELP zyphron_redis_memory_bytes Redis memory usage in bytes`);
        metrics.push(`# TYPE zyphron_redis_memory_bytes gauge`);
        metrics.push(`zyphron_redis_memory_bytes ${usedMemory}`);
      }
    } catch {
      // Redis metrics not available
    }

    // Last scrape timestamp
    metrics.push(`# HELP zyphron_last_scrape_timestamp Unix timestamp of last scrape`);
    metrics.push(`# TYPE zyphron_last_scrape_timestamp gauge`);
    metrics.push(`zyphron_last_scrape_timestamp ${Math.floor(now / 1000)}`);

    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return reply.send(metrics.join('\n'));
  });

  // ===========================================
  // PROJECT METRICS
  // ===========================================

  // Get metrics for a specific project
  app.get('/projects/:projectId/metrics', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    const query = projectMetricsSchema.parse(request.query);

    // Check project access
    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId),
    });

    if (!project) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or you do not have access',
        },
      });
    }

    const periodMs = getPeriodMs(query.period);
    const since = new Date(Date.now() - periodMs);

    // Collect project-specific metrics
    const [
      totalDeployments,
      successfulDeployments,
      failedDeployments,
      recentDeployments,
    ] = await Promise.all([
      prisma.deployment.count({
        where: { projectId: project.id, createdAt: { gte: since } },
      }),
      prisma.deployment.count({
        where: { projectId: project.id, status: 'LIVE', createdAt: { gte: since } },
      }),
      prisma.deployment.count({
        where: { projectId: project.id, status: 'FAILED', createdAt: { gte: since } },
      }),
      prisma.deployment.findMany({
        where: { projectId: project.id, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const successRate = totalDeployments > 0
      ? ((successfulDeployments / totalDeployments) * 100).toFixed(2)
      : '0.00';

    return reply.send({
      success: true,
      data: {
        period: query.period,
        since: since.toISOString(),
        metrics: {
          deployments: {
            total: totalDeployments,
            successful: successfulDeployments,
            failed: failedDeployments,
            successRate: parseFloat(successRate),
          },
          recentDeployments,
        },
      },
    });
  });

  // ===========================================
  // USER DASHBOARD METRICS
  // ===========================================

  // Get overall metrics for dashboard
  app.get('/dashboard/metrics', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const query = timeRangeSchema.parse(request.query);

    const periodMs = getPeriodMs(query.period);
    const since = new Date(Date.now() - periodMs);

    // Get user's projects
    const userProjects = await prisma.project.findMany({
      where: {
        OR: [
          { userId },
          { team: { members: { some: { userId } } } },
        ],
      },
      select: { id: true },
    });

    const projectIds = userProjects.map(p => p.id);

    const [
      totalProjects,
      totalDeployments,
      successfulDeployments,
      failedDeployments,
      activeDeployments,
      totalDatabases,
      recentActivity,
    ] = await Promise.all([
      prisma.project.count({
        where: {
          OR: [
            { userId },
            { team: { members: { some: { userId } } } },
          ],
        },
      }),
      prisma.deployment.count({
        where: {
          projectId: { in: projectIds },
          createdAt: { gte: since },
        },
      }),
      prisma.deployment.count({
        where: {
          projectId: { in: projectIds },
          status: 'LIVE',
          createdAt: { gte: since },
        },
      }),
      prisma.deployment.count({
        where: {
          projectId: { in: projectIds },
          status: 'FAILED',
          createdAt: { gte: since },
        },
      }),
      prisma.deployment.count({
        where: {
          projectId: { in: projectIds },
          status: 'LIVE',
        },
      }),
      prisma.database.count({
        where: { projectId: { in: projectIds } },
      }),
      prisma.deployment.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          project: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      }),
    ]);

    const successRate = totalDeployments > 0
      ? ((successfulDeployments / totalDeployments) * 100).toFixed(2)
      : '0.00';

    return reply.send({
      success: true,
      data: {
        period: query.period,
        since: since.toISOString(),
        overview: {
          totalProjects,
          activeDeployments,
          totalDatabases,
        },
        deployments: {
          total: totalDeployments,
          successful: successfulDeployments,
          failed: failedDeployments,
          successRate: parseFloat(successRate),
        },
        recentActivity: recentActivity.map(d => ({
          id: d.id,
          projectName: d.project.name,
          projectSlug: d.project.slug,
          status: d.status,
          createdAt: d.createdAt,
        })),
      },
    });
  });

  // ===========================================
  // ADMIN METRICS
  // ===========================================

  // Admin system metrics (platform-level view)
  app.get('/admin/metrics', {
    onRequest: [app.authenticate, app.requireAdmin],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {

    const [
      totalUsers,
      totalProjects,
      totalDeployments,
      totalDatabases,
      deploymentsToday,
      databasesByType,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.deployment.count(),
      prisma.database.count(),
      prisma.deployment.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      prisma.database.groupBy({
        by: ['type'],
        _count: true,
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        totals: {
          users: totalUsers,
          projects: totalProjects,
          deployments: totalDeployments,
          databases: totalDatabases,
        },
        today: {
          deployments: deploymentsToday,
        },
        breakdown: {
          databasesByType: databasesByType.map((d: { type: string; _count: number }) => ({
            type: d.type,
            count: d._count,
          })),
        },
      },
    });
  });
}
