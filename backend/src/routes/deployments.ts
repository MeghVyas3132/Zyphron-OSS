import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { getRedisClient, publishEvent } from '@/lib/redis.js';
import { sendDeploymentEvent } from '@/lib/kafka.js';

const logger = createLogger('deployments');

const triggerDeploymentSchema = z.object({
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  environment: z.enum(['PRODUCTION', 'PREVIEW', 'STAGING', 'DEVELOPMENT']).default('PRODUCTION'),
  force: z.boolean().default(false),
  serviceIds: z.array(z.string()).optional(),
});

const deploymentQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['QUEUED', 'BUILDING', 'DEPLOYING', 'LIVE', 'FAILED', 'CANCELLED', 'ROLLING_BACK']).optional(),
  environment: z.enum(['PRODUCTION', 'PREVIEW', 'STAGING', 'DEVELOPMENT']).optional(),
});

const rollbackSchema = z.object({
  targetDeploymentId: z.string(),
});

export async function deploymentRoutes(app: FastifyInstance): Promise<void> {
  const redis = getRedisClient();

  app.get('/projects/:projectId/deployments', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    const query = deploymentQuerySchema.parse(request.query);

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const skip = (query.page - 1) * query.limit;
    const where: Record<string, unknown> = { projectId };
    if (query.status) where.status = query.status;
    if (query.environment) where.environment = query.environment;

    const [deployments, total] = await Promise.all([
      prisma.deployment.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          buildJob: true,
          serviceDeployments: { include: { service: true } },
        },
      }),
      prisma.deployment.count({ where }),
    ]);

    return reply.send({
      deployments,
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    });
  });

  app.post('/projects/:projectId/deployments', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    const body = triggerDeploymentSchema.parse(request.body);

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: { services: true, envVariables: true },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    if (!body.force) {
      const active = await prisma.deployment.findFirst({
        where: { projectId, status: { in: ['QUEUED', 'BUILDING', 'DEPLOYING'] } },
      });
      if (active) {
        return reply.status(409).send({ error: 'Active deployment in progress', deploymentId: active.id });
      }
    }

    const deployment = await prisma.deployment.create({
      data: {
        projectId,
        userId,
        status: 'QUEUED',
        environment: body.environment,
        branch: body.branch || project.branch || 'main',
        commitSha: body.commitSha,
        trigger: 'MANUAL',
      },
    });

    await prisma.buildJob.create({
      data: { deploymentId: deployment.id, status: 'PENDING' },
    });

    const servicesToDeploy = body.serviceIds 
      ? project.services.filter(s => body.serviceIds!.includes(s.id))
      : project.services;

    if (servicesToDeploy.length > 0) {
      await prisma.serviceDeployment.createMany({
        data: servicesToDeploy.map(service => ({
          deploymentId: deployment.id,
          serviceId: service.id,
          status: 'PENDING',
        })),
      });
    }

    try {
      await sendDeploymentEvent(deployment.id, 'DEPLOYMENT_CREATED', {
        deploymentId: deployment.id,
        projectId,
        userId,
        environment: body.environment,
        branch: body.branch || project.branch || 'main',
        repositoryUrl: project.repositoryUrl,
      });
    } catch (err) {
      logger.error('Failed to send Kafka event', { error: err });
    }

    await publishEvent('deployment:created', { deploymentId: deployment.id, status: 'QUEUED' });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'DEPLOYMENT_TRIGGERED',
        resourceType: 'Deployment',
        resourceId: deployment.id,
        metadata: { projectId, environment: body.environment },
      },
    });

    const full = await prisma.deployment.findUnique({
      where: { id: deployment.id },
      include: { buildJob: true, serviceDeployments: { include: { service: true } } },
    });

    logger.info('Deployment triggered', { deploymentId: deployment.id });
    return reply.status(201).send({ deployment: full });
  });

  app.get('/deployments/:id', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { id } = request.params;

    const deployment = await prisma.deployment.findFirst({
      where: { id },
      include: { project: true, buildJob: true, serviceDeployments: { include: { service: true } } },
    });

    if (!deployment) return reply.status(404).send({ error: 'Deployment not found' });
    if (deployment.project.userId !== userId) return reply.status(403).send({ error: 'Forbidden' });

    return reply.send({ deployment });
  });

  app.post('/deployments/:id/cancel', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { id } = request.params;

    const deployment = await prisma.deployment.findFirst({
      where: { id },
      include: { project: true },
    });

    if (!deployment) return reply.status(404).send({ error: 'Deployment not found' });
    if (deployment.project.userId !== userId) return reply.status(403).send({ error: 'Forbidden' });
    if (!['QUEUED', 'BUILDING', 'DEPLOYING'].includes(deployment.status)) {
      return reply.status(400).send({ error: 'Cannot cancel', reason: deployment.status });
    }

    const updated = await prisma.deployment.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
      include: { buildJob: true },
    });

    if (updated.buildJob) {
      await prisma.buildJob.update({ where: { id: updated.buildJob.id }, data: { status: 'CANCELLED' } });
    }

    await publishEvent('deployment:cancelled', { deploymentId: id });
    logger.info('Deployment cancelled', { deploymentId: id });
    return reply.send({ deployment: updated });
  });

  app.post('/deployments/:id/rollback', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { id } = request.params;
    const body = rollbackSchema.parse(request.body);

    const current = await prisma.deployment.findFirst({ where: { id }, include: { project: true } });
    if (!current) return reply.status(404).send({ error: 'Deployment not found' });
    if (current.project.userId !== userId) return reply.status(403).send({ error: 'Forbidden' });

    const target = await prisma.deployment.findFirst({
      where: { id: body.targetDeploymentId, projectId: current.projectId, status: 'LIVE' },
    });
    if (!target) return reply.status(404).send({ error: 'Target deployment not found' });

    await prisma.deployment.update({ where: { id }, data: { status: 'ROLLING_BACK' } });

    const rollback = await prisma.deployment.create({
      data: {
        projectId: current.projectId,
        userId,
        status: 'QUEUED',
        environment: target.environment,
        branch: target.branch,
        commitSha: target.commitSha,
        trigger: 'ROLLBACK',
        metadata: { rollbackFrom: id, rollbackTo: body.targetDeploymentId },
      },
    });

    await prisma.buildJob.create({ data: { deploymentId: rollback.id, status: 'PENDING' } });
    await sendDeploymentEvent(rollback.id, 'DEPLOYMENT_CREATED', { isRollback: true });
    logger.info('Rollback initiated', { from: id, to: body.targetDeploymentId });
    return reply.status(201).send({ deployment: rollback });
  });

  app.post('/deployments/:id/redeploy', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { id } = request.params;

    const source = await prisma.deployment.findFirst({
      where: { id },
      include: { project: { include: { services: true } } },
    });
    if (!source) return reply.status(404).send({ error: 'Deployment not found' });
    if (source.project.userId !== userId) return reply.status(403).send({ error: 'Forbidden' });

    const newDep = await prisma.deployment.create({
      data: {
        projectId: source.projectId,
        userId,
        status: 'QUEUED',
        environment: source.environment,
        branch: source.branch,
        commitSha: source.commitSha,
        trigger: 'MANUAL',
      },
    });

    await prisma.buildJob.create({ data: { deploymentId: newDep.id, status: 'PENDING' } });
    await sendDeploymentEvent(newDep.id, 'DEPLOYMENT_CREATED', { redeployFrom: id });
    logger.info('Redeploy triggered', { from: id, new: newDep.id });
    return reply.status(201).send({ deployment: newDep });
  });

  app.get('/deployments/:id/logs', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { id } = request.params;

    const deployment = await prisma.deployment.findFirst({
      where: { id },
      include: { project: true },
    });
    if (!deployment) return reply.status(404).send({ error: 'Deployment not found' });
    if (deployment.project.userId !== userId) return reply.status(403).send({ error: 'Forbidden' });

    const buildLogs = deployment.buildLogs ? deployment.buildLogs.split('\n') : [];
    return reply.send({ logs: { build: buildLogs } });
  });

  app.get('/deployments/active', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const active = await prisma.deployment.findMany({
      where: { userId, status: { in: ['QUEUED', 'BUILDING', 'DEPLOYING'] } },
      include: { project: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ deployments: active });
  });

  app.get('/deployments/recent', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const limit = parseInt(request.query.limit || '10', 10);
    const recent = await prisma.deployment.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { project: { select: { id: true, name: true, slug: true } } },
    });
    return reply.send({ deployments: recent });
  });
}
