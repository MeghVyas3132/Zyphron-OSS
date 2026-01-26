// ===========================================
// DEPLOYMENT STRATEGIES ROUTES
// Rolling, Blue-Green, Canary deployment APIs
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { deploymentStrategiesService, RollingConfig, BlueGreenConfig, CanaryConfig, ShadowConfig } from '../services/strategies/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('strategies-routes');

export async function strategiesRoutes(fastify: FastifyInstance) {
  // Get available strategies
  fastify.get('/strategies', async (_request: FastifyRequest, reply: FastifyReply) => {
    const strategies = deploymentStrategiesService.getStrategies();
    return reply.send({ strategies });
  });

  // Get recommended strategy for a project
  fastify.post('/strategies/recommend', async (
    request: FastifyRequest<{
      Body: {
        isStateful: boolean;
        hasDatabase: boolean;
        isHighTraffic: boolean;
        requiresZeroDowntime: boolean;
        hasCriticalUsers: boolean;
      }
    }>,
    reply: FastifyReply
  ) => {
    const recommendation = deploymentStrategiesService.getRecommendedStrategy(request.body);
    return reply.send(recommendation);
  });

  // Generate rollout plan
  fastify.post('/strategies/plan', async (
    request: FastifyRequest<{
      Body: RollingConfig | BlueGreenConfig | CanaryConfig | ShadowConfig
    }>,
    reply: FastifyReply
  ) => {
    try {
      const plan = deploymentStrategiesService.generateRolloutPlan(request.body);
      const duration = 'strategy' in request.body && (request.body.strategy === 'rolling' || request.body.strategy === 'blue-green' || request.body.strategy === 'canary')
        ? deploymentStrategiesService.estimateDuration(request.body as RollingConfig | BlueGreenConfig | CanaryConfig)
        : 120;

      return reply.send({
        strategy: request.body.strategy,
        plan,
        estimatedDuration: duration,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate rollout plan');
      return reply.status(400).send({ error: 'Failed to generate plan' });
    }
  });

  // Start deployment with strategy
  fastify.post('/strategies/deploy', async (
    request: FastifyRequest<{
      Body: RollingConfig | BlueGreenConfig | CanaryConfig | ShadowConfig
    }>,
    reply: FastifyReply
  ) => {
    try {
      const state = await deploymentStrategiesService.startDeployment(request.body);
      logger.info({ deploymentId: state.id, strategy: request.body.strategy }, 'Strategy deployment started');
      return reply.send(state);
    } catch (error) {
      logger.error({ error }, 'Failed to start deployment');
      return reply.status(500).send({ error: 'Failed to start deployment' });
    }
  });

  // Get deployment state
  fastify.get('/strategies/deployment/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const state = await deploymentStrategiesService.getDeploymentState(request.params.id);
    if (!state) {
      return reply.status(404).send({ error: 'Deployment not found' });
    }
    return reply.send(state);
  });

  // Promote canary
  fastify.post('/strategies/deployment/:id/promote', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { weight: number }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const state = await deploymentStrategiesService.promoteCanary(
        request.params.id,
        request.body.weight
      );
      if (!state) {
        return reply.status(404).send({ error: 'Deployment not found or not canary' });
      }
      return reply.send(state);
    } catch (error) {
      logger.error({ error }, 'Failed to promote canary');
      return reply.status(500).send({ error: 'Failed to promote canary' });
    }
  });

  // Switch blue-green
  fastify.post('/strategies/deployment/:id/switch', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const state = await deploymentStrategiesService.switchBlueGreen(request.params.id);
      if (!state) {
        return reply.status(404).send({ error: 'Deployment not found or not blue-green' });
      }
      return reply.send(state);
    } catch (error) {
      logger.error({ error }, 'Failed to switch blue-green');
      return reply.status(500).send({ error: 'Failed to switch' });
    }
  });

  // Rollback deployment
  fastify.post('/strategies/deployment/:id/rollback', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const state = await deploymentStrategiesService.rollback(request.params.id);
      if (!state) {
        return reply.status(404).send({ error: 'Deployment not found' });
      }
      return reply.send(state);
    } catch (error) {
      logger.error({ error }, 'Failed to rollback');
      return reply.status(500).send({ error: 'Failed to rollback' });
    }
  });

  // Get deployment history
  fastify.get('/projects/:projectId/deployment-history', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Querystring: { limit?: number }
    }>,
    reply: FastifyReply
  ) => {
    const history = await deploymentStrategiesService.getDeploymentHistory(
      request.params.projectId,
      request.query.limit
    );
    return reply.send({ history });
  });
}

export default strategiesRoutes;
