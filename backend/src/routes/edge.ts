// ===========================================
// EDGE FUNCTIONS ROUTES
// Serverless edge function APIs
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { edgeFunctionsService, EdgeRuntime, EdgeRoute, EdgeRegion, EdgeLimits } from '../services/edge/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('edge-routes');

export async function edgeRoutes(fastify: FastifyInstance) {
  // Get supported runtimes
  fastify.get('/runtimes', async (_request: FastifyRequest, reply: FastifyReply) => {
    const runtimes = edgeFunctionsService.getSupportedRuntimes();
    return reply.send({ runtimes });
  });

  // Get function template
  fastify.get('/templates/:type', async (
    request: FastifyRequest<{ Params: { type: 'hello-world' | 'api' | 'redirect' | 'auth' } }>,
    reply: FastifyReply
  ) => {
    const template = edgeFunctionsService.generateTemplate(request.params.type);
    return reply.send({ template, type: request.params.type });
  });

  // Create edge function
  fastify.post('/projects/:projectId/functions', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: {
        name: string;
        code: string;
        runtime?: EdgeRuntime;
        routes?: EdgeRoute[];
        envVars?: Record<string, string>;
        regions?: EdgeRegion[];
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const fn = await edgeFunctionsService.createFunction({
        projectId: request.params.projectId,
        ...request.body,
      });
      logger.info({ functionId: fn.id, projectId: request.params.projectId }, 'Edge function created');
      return reply.status(201).send(fn);
    } catch (error) {
      logger.error({ error }, 'Failed to create edge function');
      return reply.status(500).send({ error: 'Failed to create function' });
    }
  });

  // Get project functions
  fastify.get('/projects/:projectId/functions', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const functions = await edgeFunctionsService.getProjectFunctions(request.params.projectId);
    return reply.send({ functions });
  });

  // Get function by ID
  fastify.get('/functions/:functionId', async (
    request: FastifyRequest<{ Params: { functionId: string } }>,
    reply: FastifyReply
  ) => {
    const fn = await edgeFunctionsService.getFunction(request.params.functionId);
    if (!fn) {
      return reply.status(404).send({ error: 'Function not found' });
    }
    return reply.send(fn);
  });

  // Update function
  fastify.patch('/functions/:functionId', async (
    request: FastifyRequest<{
      Params: { functionId: string };
      Body: Partial<{
        name: string;
        code: string;
        routes: EdgeRoute[];
        envVars: Record<string, string>;
        regions: EdgeRegion[];
        limits: EdgeLimits;
      }>
    }>,
    reply: FastifyReply
  ) => {
    try {
      const fn = await edgeFunctionsService.updateFunction(
        request.params.functionId,
        request.body
      );
      if (!fn) {
        return reply.status(404).send({ error: 'Function not found' });
      }
      return reply.send(fn);
    } catch (error) {
      logger.error({ error }, 'Failed to update edge function');
      return reply.status(500).send({ error: 'Failed to update function' });
    }
  });

  // Deploy function
  fastify.post('/functions/:functionId/deploy', async (
    request: FastifyRequest<{
      Params: { functionId: string };
      Body: { regions?: EdgeRegion[] }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const deployment = await edgeFunctionsService.deployFunction(
        request.params.functionId,
        request.body.regions
      );
      logger.info({ functionId: request.params.functionId }, 'Edge function deployed');
      return reply.send(deployment);
    } catch (error) {
      logger.error({ error }, 'Failed to deploy edge function');
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to deploy',
      });
    }
  });

  // Rollback function
  fastify.post('/functions/:functionId/rollback', async (
    request: FastifyRequest<{
      Params: { functionId: string };
      Body: { version: number }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const fn = await edgeFunctionsService.rollbackFunction(
        request.params.functionId,
        request.body.version
      );
      if (!fn) {
        return reply.status(404).send({ error: 'Function or version not found' });
      }
      return reply.send(fn);
    } catch (error) {
      logger.error({ error }, 'Failed to rollback edge function');
      return reply.status(500).send({ error: 'Failed to rollback' });
    }
  });

  // Delete function
  fastify.delete('/functions/:functionId', async (
    request: FastifyRequest<{ Params: { functionId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const deleted = await edgeFunctionsService.deleteFunction(request.params.functionId);
      if (!deleted) {
        return reply.status(404).send({ error: 'Function not found' });
      }
      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to delete edge function');
      return reply.status(500).send({ error: 'Failed to delete' });
    }
  });

  // Invoke function (for testing)
  fastify.post('/functions/:functionId/invoke', async (
    request: FastifyRequest<{
      Params: { functionId: string };
      Body: {
        method?: string;
        path?: string;
        headers?: Record<string, string>;
        body?: unknown;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const result = await edgeFunctionsService.invokeFunction(
        request.params.functionId,
        {
          method: request.body.method || 'GET',
          path: request.body.path || '/',
          headers: request.body.headers || {},
          body: request.body.body,
        }
      );
      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Failed to invoke edge function');
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to invoke',
      });
    }
  });

  // Get function logs
  fastify.get('/functions/:functionId/logs', async (
    request: FastifyRequest<{
      Params: { functionId: string };
      Querystring: { limit?: number; startTime?: string; endTime?: string }
    }>,
    reply: FastifyReply
  ) => {
    const logs = await edgeFunctionsService.getFunctionLogs(
      request.params.functionId,
      {
        limit: request.query.limit,
        startTime: request.query.startTime ? new Date(request.query.startTime) : undefined,
        endTime: request.query.endTime ? new Date(request.query.endTime) : undefined,
      }
    );
    return reply.send({ logs });
  });

  // Get function metrics
  fastify.get('/functions/:functionId/metrics', async (
    request: FastifyRequest<{ Params: { functionId: string } }>,
    reply: FastifyReply
  ) => {
    const metrics = await edgeFunctionsService.getFunctionMetrics(request.params.functionId);
    return reply.send(metrics);
  });
}

export default edgeRoutes;
