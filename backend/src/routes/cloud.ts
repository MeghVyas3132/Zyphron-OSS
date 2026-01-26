// ===========================================
// MULTI-CLOUD ROUTES
// API endpoints for multi-cloud deployments
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { multiCloudService, CloudProvider } from '../services/cloud/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('cloud-routes');

export async function cloudRoutes(fastify: FastifyInstance) {
  // ===========================================
  // PROVIDERS & REGIONS
  // ===========================================

  // Get available cloud providers
  fastify.get('/providers', async (_request: FastifyRequest, reply: FastifyReply) => {
    const providers = multiCloudService.getProviders();
    return reply.send({ providers });
  });

  // Get regions for a provider
  fastify.get('/providers/:provider/regions', async (
    request: FastifyRequest<{ Params: { provider: string } }>,
    reply: FastifyReply
  ) => {
    const { provider } = request.params;
    const regions = multiCloudService.getRegions(provider as CloudProvider);

    if (regions.length === 0) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    return reply.send({ provider, regions });
  });

  // Get all regions across all providers
  fastify.get('/regions', async (_request: FastifyRequest, reply: FastifyReply) => {
    const regions = multiCloudService.getAllRegions();
    return reply.send({ regions });
  });

  // ===========================================
  // CREDENTIALS
  // ===========================================

  // Store cloud credentials
  fastify.post('/credentials', async (
    request: FastifyRequest<{
      Body: {
        teamId: string;
        provider: CloudProvider;
        credentials: Record<string, string>;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { teamId, provider, credentials } = request.body;

      await multiCloudService.storeCredentials(teamId, provider, credentials);

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
  });

  // Validate cloud credentials
  fastify.post('/credentials/validate', async (
    request: FastifyRequest<{
      Body: {
        provider: CloudProvider;
        credentials: Record<string, string>;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { provider, credentials } = request.body;
      const valid = await multiCloudService.validateCredentials(provider, credentials);

      return reply.send({ valid });
    } catch (error) {
      logger.error({ error }, 'Failed to validate credentials');
      return reply.status(400).send({
        error: error instanceof Error ? error.message : 'Failed to validate credentials',
      });
    }
  });

  // ===========================================
  // DEPLOYMENTS
  // ===========================================

  // Deploy to a single cloud provider
  fastify.post('/deploy', async (
    request: FastifyRequest<{
      Body: {
        projectId: string;
        image: string;
        provider: CloudProvider;
        region: string;
        resources: { cpu: string; memory: string; replicas?: number };
        env?: Record<string, string>;
        domain?: string;
        healthCheck?: { path: string; interval: number; timeout: number };
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const config = request.body;
      const resource = await multiCloudService.deploy({
        ...config,
        env: config.env || {},
      });

      logger.info({ projectId: config.projectId, provider: config.provider }, 'Cloud deployment initiated');

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
  });

  // Deploy to multiple clouds/regions
  fastify.post('/deploy/multi', async (
    request: FastifyRequest<{
      Body: {
        projectId: string;
        image: string;
        targets: { provider: CloudProvider; region: string }[];
        resources: { cpu: string; memory: string };
        env?: Record<string, string>;
        strategy?: 'primary-backup' | 'active-active' | 'geo-distributed';
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { projectId, image, targets, resources, env, strategy } = request.body;

      const deployment = await multiCloudService.deployMultiCloud(
        projectId,
        image,
        targets,
        resources,
        env || {},
        strategy
      );

      logger.info({ projectId, targets: targets.length, strategy }, 'Multi-cloud deployment initiated');

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
  });

  // ===========================================
  // RESOURCES
  // ===========================================

  // Get all resources for a project
  fastify.get('/resources/:projectId', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { projectId } = request.params;
      const resources = await multiCloudService.getProjectResources(projectId);

      return reply.send({ projectId, resources });
    } catch (error) {
      logger.error({ error }, 'Failed to get resources');
      return reply.status(500).send({
        error: 'Failed to get resources',
      });
    }
  });

  // Get specific resource
  fastify.get('/resources/:projectId/:resourceId', async (
    request: FastifyRequest<{ Params: { projectId: string; resourceId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { projectId, resourceId } = request.params;
      const resource = await multiCloudService.getResource(projectId, resourceId);

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
  });

  // Delete resource
  fastify.delete('/resources/:projectId/:resourceId', async (
    request: FastifyRequest<{ Params: { projectId: string; resourceId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { projectId, resourceId } = request.params;
      await multiCloudService.deleteResource(projectId, resourceId);

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
  });

  // ===========================================
  // COST ESTIMATION
  // ===========================================

  // Estimate deployment costs
  fastify.post('/estimate', async (
    request: FastifyRequest<{
      Body: {
        provider: CloudProvider;
        region: string;
        cpu: string;
        memory: string;
        hoursPerMonth?: number;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const estimate = multiCloudService.estimateCosts(request.body);
      return reply.send(estimate);
    } catch (error) {
      logger.error({ error }, 'Failed to estimate costs');
      return reply.status(500).send({
        error: 'Failed to estimate costs',
      });
    }
  });

  // Compare costs across providers
  fastify.post('/estimate/compare', async (
    request: FastifyRequest<{
      Body: {
        cpu: string;
        memory: string;
        hoursPerMonth?: number;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { cpu, memory, hoursPerMonth } = request.body;
      const providers: CloudProvider[] = ['aws', 'gcp', 'azure', 'oracle'];

      const comparison = providers.map(provider => ({
        provider,
        ...multiCloudService.estimateCosts({
          provider,
          region: 'default',
          cpu,
          memory,
          hoursPerMonth,
        }),
      }));

      // Sort by estimated cost
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

  // Get optimal region based on location
  fastify.post('/optimal-region', async (
    request: FastifyRequest<{
      Body: {
        provider: CloudProvider;
        userLocation?: { lat: number; lng: number };
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { provider, userLocation } = request.body;
      const region = multiCloudService.getOptimalRegion(provider, userLocation);

      return reply.send({ provider, optimalRegion: region });
    } catch (error) {
      logger.error({ error }, 'Failed to get optimal region');
      return reply.status(500).send({
        error: 'Failed to get optimal region',
      });
    }
  });
}

export default cloudRoutes;
