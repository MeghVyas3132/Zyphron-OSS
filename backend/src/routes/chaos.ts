// ===========================================
// CHAOS ENGINEERING ROUTES
// Resilience testing and chaos experiment APIs
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { chaosEngineeringService, ExperimentType, ExperimentConfig, ExperimentTarget, ExperimentSchedule } from '../services/chaos/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('chaos-routes');

export async function chaosRoutes(fastify: FastifyInstance) {
  // Get available experiment types
  fastify.get('/experiments/types', async (_request: FastifyRequest, reply: FastifyReply) => {
    const types = chaosEngineeringService.getExperimentTypes();
    return reply.send({ types });
  });

  // Get gameday scenarios
  fastify.get('/experiments/gamedays', async (_request: FastifyRequest, reply: FastifyReply) => {
    const scenarios = chaosEngineeringService.getGamedayScenarios();
    return reply.send({ scenarios });
  });

  // Create experiment
  fastify.post('/projects/:projectId/experiments', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: {
        name: string;
        description?: string;
        type: ExperimentType;
        config?: Partial<ExperimentConfig>;
        target: ExperimentTarget;
        schedule?: ExperimentSchedule;
        createdBy: string;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const experiment = await chaosEngineeringService.createExperiment({
        projectId: request.params.projectId,
        ...request.body,
      });
      logger.info({ experimentId: experiment.id, type: request.body.type }, 'Chaos experiment created');
      return reply.status(201).send(experiment);
    } catch (error) {
      logger.error({ error }, 'Failed to create experiment');
      return reply.status(500).send({ error: 'Failed to create experiment' });
    }
  });

  // Get project experiments
  fastify.get('/projects/:projectId/experiments', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const experiments = await chaosEngineeringService.getProjectExperiments(request.params.projectId);
    return reply.send({ experiments });
  });

  // Get experiment by ID
  fastify.get('/experiments/:experimentId', async (
    request: FastifyRequest<{ Params: { experimentId: string } }>,
    reply: FastifyReply
  ) => {
    const experiment = await chaosEngineeringService.getExperiment(request.params.experimentId);
    if (!experiment) {
      return reply.status(404).send({ error: 'Experiment not found' });
    }
    return reply.send(experiment);
  });

  // Run experiment
  fastify.post('/experiments/:experimentId/run', async (
    request: FastifyRequest<{ Params: { experimentId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const experiment = await chaosEngineeringService.runExperiment(request.params.experimentId);
      logger.info({ experimentId: experiment.id }, 'Chaos experiment started');
      return reply.send(experiment);
    } catch (error) {
      logger.error({ error }, 'Failed to run experiment');
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to run experiment',
      });
    }
  });

  // Abort experiment
  fastify.post('/experiments/:experimentId/abort', async (
    request: FastifyRequest<{ Params: { experimentId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const experiment = await chaosEngineeringService.abortExperiment(request.params.experimentId);
      if (!experiment) {
        return reply.status(404).send({ error: 'Experiment not found' });
      }
      return reply.send(experiment);
    } catch (error) {
      logger.error({ error }, 'Failed to abort experiment');
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to abort experiment',
      });
    }
  });

  // Delete experiment
  fastify.delete('/experiments/:experimentId', async (
    request: FastifyRequest<{ Params: { experimentId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const deleted = await chaosEngineeringService.deleteExperiment(request.params.experimentId);
      if (!deleted) {
        return reply.status(404).send({ error: 'Experiment not found' });
      }
      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to delete experiment');
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to delete experiment',
      });
    }
  });

  // Get experiment history
  fastify.get('/projects/:projectId/experiments/history', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Querystring: { limit?: number }
    }>,
    reply: FastifyReply
  ) => {
    const history = await chaosEngineeringService.getExperimentHistory(
      request.params.projectId,
      request.query.limit
    );
    return reply.send({ history });
  });

  // Get resilience score
  fastify.get('/projects/:projectId/resilience', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const score = await chaosEngineeringService.getResilienceScore(request.params.projectId);
    return reply.send(score);
  });
}

export default chaosRoutes;
