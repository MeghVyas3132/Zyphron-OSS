// ===========================================
// MULTI-CLOUD ROUTES
// API endpoints for multi-cloud deployments
// ===========================================

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { audit } from '@/services/audit/index.js';
import {
  TEAM_ROLES_READ,
  TEAM_ROLES_WRITE,
  projectAccessFilter,
  projectWhereForUser,
} from '@/lib/project-access.js';
import { CloudProvider, multiCloudService } from '@/services/cloud/index.js';

const logger = createLogger('cloud-routes');

const providerSchema = z.enum(['aws', 'gcp', 'azure', 'oracle', 'digitalocean', 'linode']);

const storeCredentialsSchema = z.object({
  teamId: z.string().min(1),
  provider: providerSchema,
  credentials: z.record(z.string()),
});

const validateCredentialsSchema = z.object({
  provider: providerSchema,
  credentials: z.record(z.string()),
});

const deploySchema = z.object({
  projectId: z.string().min(1),
  image: z.string().min(1),
  provider: providerSchema,
  region: z.string().min(1),
  resources: z.object({
    cpu: z.string().min(1),
    memory: z.string().min(1),
    replicas: z.coerce.number().int().min(1).max(100).optional(),
  }),
  env: z.record(z.string()).optional(),
  domain: z.string().optional(),
  healthCheck: z
    .object({
      path: z.string().min(1),
      interval: z.coerce.number().int().min(1),
      timeout: z.coerce.number().int().min(1),
    })
    .optional(),
});

const deployMultiSchema = z.object({
  projectId: z.string().min(1),
  image: z.string().min(1),
  targets: z.array(
    z.object({
      provider: providerSchema,
      region: z.string().min(1),
    })
  ),
  resources: z.object({
    cpu: z.string().min(1),
    memory: z.string().min(1),
  }),
  env: z.record(z.string()).optional(),
  strategy: z.enum(['primary-backup', 'active-active', 'geo-distributed']).optional(),
});

const listDeploymentsQuerySchema = z.object({
  projectId: z.string().optional(),
  provider: providerSchema.optional(),
});

const scaleDeploymentSchema = z.object({
  replicas: z.coerce.number().int().min(1).max(100),
});

const estimateSchema = z.object({
  provider: providerSchema,
  region: z.string().min(1),
  cpu: z.string().min(1),
  memory: z.string().min(1),
  hoursPerMonth: z.coerce.number().positive().optional(),
});

const compareSchema = z.object({
  cpu: z.string().min(1),
  memory: z.string().min(1),
  hoursPerMonth: z.coerce.number().positive().optional(),
});

const optimalRegionSchema = z.object({
  provider: providerSchema,
  userLocation: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

async function ensureProjectAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  identifier: string,
  roles: typeof TEAM_ROLES_READ
) {
  const userId = request.user?.id;
  if (!userId) {
    reply.status(401).send({
      success: false,
      error: 'Unauthorized',
    });
    return null;
  }

  const project = await prisma.project.findFirst({
    where: projectWhereForUser(identifier, userId, roles),
    select: { id: true, slug: true, name: true },
  });

  if (!project) {
    reply.status(404).send({
      success: false,
      error: 'Project not found or access denied',
    });
    return null;
  }

  return project;
}

export async function cloudRoutes(fastify: FastifyInstance) {
  // ===========================================
  // PROVIDERS & REGIONS
  // ===========================================

  fastify.get('/providers', async (_request: FastifyRequest, reply: FastifyReply) => {
    const providers = multiCloudService.getProviders();
    return reply.send({ providers });
  });

  fastify.get(
    '/providers/:provider/regions',
    async (request: FastifyRequest<{ Params: { provider: string } }>, reply: FastifyReply) => {
      const parsed = providerSchema.safeParse(request.params.provider);
      if (!parsed.success) {
        return reply.status(404).send({ error: 'Provider not found' });
      }

      const regions = multiCloudService.getRegions(parsed.data as CloudProvider);
      return reply.send({ provider: parsed.data, regions });
    }
  );

  fastify.get('/regions', async (_request: FastifyRequest, reply: FastifyReply) => {
    const regions = multiCloudService.getAllRegions();
    return reply.send({ regions });
  });

  // ===========================================
  // CREDENTIALS
  // ===========================================

  fastify.post(
    '/credentials',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = storeCredentialsSchema.parse(request.body);
        await multiCloudService.storeCredentials(body.teamId, body.provider, body.credentials);
        audit(request).log('cloud.credentials.store', 'team', body.teamId, {
          provider: body.provider,
        });

        return reply.send({
          success: true,
          message: 'Credentials stored successfully',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to store credentials');
        return reply.status(400).send({
          error: error instanceof Error ? error.message : 'Failed to store credentials',
        });
      }
    }
  );

  fastify.post(
    '/credentials/validate',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = validateCredentialsSchema.parse(request.body);
        const valid = await multiCloudService.validateCredentials(body.provider, body.credentials);
        return reply.send({ valid });
      } catch (error) {
        logger.error({ error }, 'Failed to validate credentials');
        return reply.status(400).send({
          error: error instanceof Error ? error.message : 'Failed to validate credentials',
        });
      }
    }
  );

  // ===========================================
  // DEPLOYMENTS
  // ===========================================

  fastify.post(
    '/deploy',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = deploySchema.parse(request.body);
        const project = await ensureProjectAccess(request, reply, body.projectId, TEAM_ROLES_WRITE);
        if (!project) return;

        const resource = await multiCloudService.deploy({
          ...body,
          projectId: project.id,
          env: body.env || {},
        });

        audit(request).log('cloud.deploy', 'deployment', resource.id, {
          projectId: project.id,
          provider: body.provider,
          region: body.region,
        });

        logger.info(
          { projectId: project.id, provider: body.provider, resourceId: resource.id },
          'Cloud deployment initiated'
        );

        return reply.send({
          success: true,
          resource,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to deploy');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Deployment failed',
        });
      }
    }
  );

  fastify.post(
    '/deploy/multi',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = deployMultiSchema.parse(request.body);
        const project = await ensureProjectAccess(request, reply, body.projectId, TEAM_ROLES_WRITE);
        if (!project) return;

        const deployment = await multiCloudService.deployMultiCloud(
          project.id,
          body.image,
          body.targets,
          body.resources,
          body.env || {},
          body.strategy
        );

        audit(request).log('cloud.deploy.multi', 'deployment', deployment.id, {
          projectId: project.id,
          targets: body.targets,
          strategy: body.strategy || 'active-active',
        });

        logger.info(
          { projectId: project.id, targets: body.targets.length, strategy: body.strategy },
          'Multi-cloud deployment initiated'
        );

        return reply.send({
          success: true,
          deployment,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to deploy multi-cloud');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Multi-cloud deployment failed',
        });
      }
    }
  );

  fastify.get(
    '/deployments',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = listDeploymentsQuerySchema.parse(request.query);
        const userId = request.user?.id;
        if (!userId) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }

        let deployments = [];
        if (query.projectId) {
          const project = await ensureProjectAccess(request, reply, query.projectId, TEAM_ROLES_READ);
          if (!project) return;
          deployments = await multiCloudService.getDeployments(project.id);
        } else {
          const projects = await prisma.project.findMany({
            where: projectAccessFilter(userId, TEAM_ROLES_READ),
            select: { id: true },
          });

          deployments = (
            await Promise.all(projects.map((project) => multiCloudService.getDeployments(project.id)))
          ).flat();
        }

        const filtered =
          query.provider !== undefined
            ? deployments.filter((deployment) => deployment.provider === query.provider)
            : deployments;

        return reply.send({
          deployments: filtered,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list cloud deployments');
        return reply.status(500).send({
          error: 'Failed to list cloud deployments',
        });
      }
    }
  );

  fastify.post(
    '/deployments/:deploymentId/scale',
    { onRequest: [fastify.authenticate] },
    async (
      request: FastifyRequest<{ Params: { deploymentId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const body = scaleDeploymentSchema.parse(request.body);
        const { deploymentId } = request.params;

        const projectId = await multiCloudService.findResourceProject(deploymentId);
        if (!projectId) {
          return reply.status(404).send({ error: 'Deployment not found' });
        }

        const project = await ensureProjectAccess(request, reply, projectId, TEAM_ROLES_WRITE);
        if (!project) return;

        const resource = await multiCloudService.scaleResource(deploymentId, body.replicas);
        audit(request).log('cloud.deploy.scale', 'deployment', deploymentId, {
          projectId: project.id,
          replicas: body.replicas,
        });

        return reply.send({
          success: true,
          resource,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to scale deployment');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to scale deployment',
        });
      }
    }
  );

  // ===========================================
  // RESOURCES
  // ===========================================

  fastify.get(
    '/resources/:projectId',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
      try {
        const project = await ensureProjectAccess(request, reply, request.params.projectId, TEAM_ROLES_READ);
        if (!project) return;

        const resources = await multiCloudService.getProjectResources(project.id);
        return reply.send({ projectId: project.id, resources });
      } catch (error) {
        logger.error({ error }, 'Failed to get resources');
        return reply.status(500).send({
          error: 'Failed to get resources',
        });
      }
    }
  );

  fastify.get(
    '/resources/:projectId/:resourceId',
    { onRequest: [fastify.authenticate] },
    async (
      request: FastifyRequest<{ Params: { projectId: string; resourceId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const project = await ensureProjectAccess(request, reply, request.params.projectId, TEAM_ROLES_READ);
        if (!project) return;

        const resource = await multiCloudService.getResource(project.id, request.params.resourceId);
        if (!resource) {
          return reply.status(404).send({ error: 'Resource not found' });
        }

        return reply.send({ resource });
      } catch (error) {
        logger.error({ error }, 'Failed to get resource');
        return reply.status(500).send({
          error: 'Failed to get resource',
        });
      }
    }
  );

  fastify.delete(
    '/resources/:projectId/:resourceId',
    { onRequest: [fastify.authenticate] },
    async (
      request: FastifyRequest<{ Params: { projectId: string; resourceId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const project = await ensureProjectAccess(request, reply, request.params.projectId, TEAM_ROLES_WRITE);
        if (!project) return;

        await multiCloudService.deleteResource(project.id, request.params.resourceId);
        audit(request).log('cloud.resource.delete', 'deployment', request.params.resourceId, {
          projectId: project.id,
        });

        return reply.send({
          success: true,
          message: 'Resource deleted',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to delete resource');
        return reply.status(500).send({
          error: 'Failed to delete resource',
        });
      }
    }
  );

  // ===========================================
  // COST ESTIMATION
  // ===========================================

  fastify.post('/estimate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = estimateSchema.parse(request.body);
      const estimate = multiCloudService.estimateCosts(body);
      return reply.send(estimate);
    } catch (error) {
      logger.error({ error }, 'Failed to estimate costs');
      return reply.status(500).send({
        error: 'Failed to estimate costs',
      });
    }
  });

  fastify.post('/estimate/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = compareSchema.parse(request.body);
      const providers: CloudProvider[] = ['aws', 'gcp', 'azure', 'oracle'];

      const comparison = providers.map((provider) => ({
        provider,
        ...multiCloudService.estimateCosts({
          provider,
          region: 'default',
          cpu: body.cpu,
          memory: body.memory,
          hoursPerMonth: body.hoursPerMonth,
        }),
      }));

      comparison.sort((a, b) => a.estimated - b.estimated);

      return reply.send({
        comparison,
        cheapest: comparison[0]?.provider,
        mostExpensive: comparison[comparison.length - 1]?.provider,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to compare costs');
      return reply.status(500).send({
        error: 'Failed to compare costs',
      });
    }
  });

  // ===========================================
  // OPTIMAL REGION
  // ===========================================

  fastify.post('/optimal-region', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = optimalRegionSchema.parse(request.body);
      const region = multiCloudService.getOptimalRegion(body.provider, body.userLocation);
      return reply.send({ provider: body.provider, optimalRegion: region });
    } catch (error) {
      logger.error({ error }, 'Failed to get optimal region');
      return reply.status(500).send({
        error: 'Failed to get optimal region',
      });
    }
  });
}

export default cloudRoutes;
