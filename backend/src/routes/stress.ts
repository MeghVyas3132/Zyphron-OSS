// ===========================================
// STRESS TEST ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { runStressTest, quickHealthProbe } from '@/services/stress-test/index.js';
import { createLogger } from '@/lib/logger.js';

const logger = createLogger('stress-routes');

const startSchema = z.object({
  virtualUsers: z.number().int().min(1).max(200).default(10),
  durationSeconds: z.number().int().min(10).max(300).default(30),
  rampUpSeconds: z.number().int().min(0).max(60).default(10),
});

export async function stressRoutes(fastify: FastifyInstance) {
  // POST /api/v1/projects/:id/stress — run a stress test
  fastify.post<{
    Params: { id: string };
    Body: z.infer<typeof startSchema>;
  }>(
    '/projects/:id/stress',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user as { id: string; email: string; name?: string };

      const body = startSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: { message: body.error.message } });
      }

      // Find project owned by this user
      const project = await prisma.project.findFirst({
        where: {
          userId: user.id,
          OR: [{ id }, { slug: id }],
        },
        include: {
          deployments: {
            where: { status: 'LIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!project) {
        return reply.status(404).send({ error: { message: 'Project not found' } });
      }

      const liveDeployment = project.deployments[0];
      if (!liveDeployment?.url) {
        return reply.status(409).send({ error: { message: 'No live deployment to test against' } });
      }

      const cfg = {
        targetUrl: liveDeployment.url,
        virtualUsers: body.data.virtualUsers,
        durationSeconds: body.data.durationSeconds,
        rampUpSeconds: Math.min(body.data.rampUpSeconds, body.data.durationSeconds - 5),
      };

      logger.info({ projectId: project.id, cfg }, 'Starting stress test');

      const result = await runStressTest(cfg, {
        userEmail: user.email,
        userName: user.name,
        projectName: project.name,
        projectId: project.id,
      });

      return reply.send({
        success: result.success,
        targetUrl: cfg.targetUrl,
        config: cfg,
        summary: result.summary,
        error: result.error,
      });
    }
  );

  // GET /api/v1/projects/:id/stress/probe — quick reachability check
  fastify.get<{ Params: { id: string } }>(
    '/projects/:id/stress/probe',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user as { id: string };

      const project = await prisma.project.findFirst({
        where: {
          userId: user.id,
          OR: [{ id }, { slug: id }],
        },
        include: {
          deployments: {
            where: { status: 'LIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!project || !project.deployments[0]?.url) {
        return reply.status(404).send({ error: { message: 'No live deployment found' } });
      }

      const probe = await quickHealthProbe(project.deployments[0].url);
      return reply.send({ ...probe, url: project.deployments[0].url });
    }
  );
}
