// ===========================================
// OBSERVABILITY ROUTES
// Metrics, Tracing, Alerts, Dashboards APIs
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { observabilityService, AlertCondition, NotificationChannel, DashboardPanel } from '../services/observability/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('observability-routes');

export async function observabilityRoutes(fastify: FastifyInstance) {
  // ===========================================
  // METRICS
  // ===========================================

  // Record metric
  fastify.post('/metrics', async (
    request: FastifyRequest<{
      Body: {
        name: string;
        value: number;
        labels?: Record<string, string>;
        type?: 'counter' | 'gauge' | 'histogram' | 'summary';
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      await observabilityService.recordMetric({
        name: request.body.name,
        value: request.body.value,
        timestamp: new Date(),
        labels: request.body.labels || {},
        type: request.body.type || 'gauge',
      });
      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to record metric');
      return reply.status(500).send({ error: 'Failed to record metric' });
    }
  });

  // Query metrics
  fastify.get('/metrics/query', async (
    request: FastifyRequest<{
      Querystring: {
        name: string;
        labels?: string;
        startTime: string;
        endTime: string;
        step?: number;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const metrics = await observabilityService.queryMetrics({
        name: request.query.name,
        labels: request.query.labels ? JSON.parse(request.query.labels) : undefined,
        startTime: new Date(request.query.startTime),
        endTime: new Date(request.query.endTime),
        step: request.query.step,
      });
      return reply.send({ metrics });
    } catch (error) {
      logger.error({ error }, 'Failed to query metrics');
      return reply.status(500).send({ error: 'Failed to query metrics' });
    }
  });

  // Get deployment metrics
  fastify.get('/deployments/:deploymentId/metrics', async (
    request: FastifyRequest<{ Params: { deploymentId: string } }>,
    reply: FastifyReply
  ) => {
    const metrics = await observabilityService.getDeploymentMetrics(request.params.deploymentId);
    return reply.send(metrics);
  });

  // ===========================================
  // TRACING
  // ===========================================

  // Start a new trace
  fastify.post('/traces', async (
    request: FastifyRequest<{
      Body: {
        serviceName: string;
        operationName: string;
        tags?: Record<string, string>;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const span = await observabilityService.startTrace(request.body);
      return reply.send(span);
    } catch (error) {
      logger.error({ error }, 'Failed to start trace');
      return reply.status(500).send({ error: 'Failed to start trace' });
    }
  });

  // Get trace by ID
  fastify.get('/traces/:traceId', async (
    request: FastifyRequest<{ Params: { traceId: string } }>,
    reply: FastifyReply
  ) => {
    const spans = await observabilityService.getTrace(request.params.traceId);
    if (spans.length === 0) {
      return reply.status(404).send({ error: 'Trace not found' });
    }
    return reply.send({ traceId: request.params.traceId, spans });
  });

  // Search traces
  fastify.get('/traces', async (
    request: FastifyRequest<{
      Querystring: {
        serviceName?: string;
        operationName?: string;
        minDuration?: number;
        maxDuration?: number;
        tags?: string;
        limit?: number;
      }
    }>,
    reply: FastifyReply
  ) => {
    const traces = await observabilityService.searchTraces({
      serviceName: request.query.serviceName,
      operationName: request.query.operationName,
      minDuration: request.query.minDuration,
      maxDuration: request.query.maxDuration,
      tags: request.query.tags ? JSON.parse(request.query.tags) : undefined,
      limit: request.query.limit,
    });
    return reply.send({ traces });
  });

  // ===========================================
  // ALERTS
  // ===========================================

  // Create alert
  fastify.post('/projects/:projectId/alerts', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: {
        name: string;
        condition: AlertCondition;
        channels: NotificationChannel[];
        severity: 'critical' | 'warning' | 'info';
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const alert = await observabilityService.createAlert({
        projectId: request.params.projectId,
        ...request.body,
      });
      logger.info({ alertId: alert.id }, 'Alert created');
      return reply.status(201).send(alert);
    } catch (error) {
      logger.error({ error }, 'Failed to create alert');
      return reply.status(500).send({ error: 'Failed to create alert' });
    }
  });

  // Get project alerts
  fastify.get('/projects/:projectId/alerts', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const alerts = await observabilityService.getProjectAlerts(request.params.projectId);
    return reply.send({ alerts });
  });

  // Silence alert
  fastify.post('/alerts/:alertId/silence', async (
    request: FastifyRequest<{
      Params: { alertId: string };
      Body: { duration: number } // seconds
    }>,
    reply: FastifyReply
  ) => {
    try {
      await observabilityService.silenceAlert(request.params.alertId, request.body.duration);
      return reply.send({ success: true, silencedFor: request.body.duration });
    } catch (error) {
      logger.error({ error }, 'Failed to silence alert');
      return reply.status(500).send({ error: 'Failed to silence alert' });
    }
  });

  // Delete alert
  fastify.delete('/alerts/:alertId', async (
    request: FastifyRequest<{ Params: { alertId: string } }>,
    reply: FastifyReply
  ) => {
    const deleted = await observabilityService.deleteAlert(request.params.alertId);
    if (!deleted) {
      return reply.status(404).send({ error: 'Alert not found' });
    }
    return reply.send({ success: true });
  });

  // ===========================================
  // LOGS
  // ===========================================

  // Query logs
  fastify.get('/logs', async (
    request: FastifyRequest<{
      Querystring: {
        service?: string;
        level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
        search?: string;
        traceId?: string;
        limit?: number;
      }
    }>,
    reply: FastifyReply
  ) => {
    const logs = await observabilityService.queryLogs(request.query);
    return reply.send({ logs });
  });

  // ===========================================
  // DASHBOARDS
  // ===========================================

  // Create dashboard
  fastify.post('/projects/:projectId/dashboards', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: {
        name: string;
        panels?: DashboardPanel[];
        refreshInterval?: number;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const dashboard = await observabilityService.createDashboard({
        projectId: request.params.projectId,
        ...request.body,
      });
      return reply.status(201).send(dashboard);
    } catch (error) {
      logger.error({ error }, 'Failed to create dashboard');
      return reply.status(500).send({ error: 'Failed to create dashboard' });
    }
  });

  // Get project dashboards
  fastify.get('/projects/:projectId/dashboards', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const dashboards = await observabilityService.getProjectDashboards(request.params.projectId);
    return reply.send({ dashboards });
  });

  // Get default dashboard template
  fastify.get('/projects/:projectId/dashboards/default', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const dashboard = observabilityService.getDefaultDashboard(request.params.projectId);
    return reply.send(dashboard);
  });

  // Get dashboard by ID
  fastify.get('/dashboards/:dashboardId', async (
    request: FastifyRequest<{ Params: { dashboardId: string } }>,
    reply: FastifyReply
  ) => {
    const dashboard = await observabilityService.getDashboard(request.params.dashboardId);
    if (!dashboard) {
      return reply.status(404).send({ error: 'Dashboard not found' });
    }
    return reply.send(dashboard);
  });

  // Update dashboard
  fastify.patch('/dashboards/:dashboardId', async (
    request: FastifyRequest<{
      Params: { dashboardId: string };
      Body: Partial<{ name: string; panels: DashboardPanel[]; refreshInterval: number }>
    }>,
    reply: FastifyReply
  ) => {
    try {
      const dashboard = await observabilityService.updateDashboard(
        request.params.dashboardId,
        request.body
      );
      if (!dashboard) {
        return reply.status(404).send({ error: 'Dashboard not found' });
      }
      return reply.send(dashboard);
    } catch (error) {
      logger.error({ error }, 'Failed to update dashboard');
      return reply.status(500).send({ error: 'Failed to update dashboard' });
    }
  });

  // Delete dashboard
  fastify.delete('/dashboards/:dashboardId', async (
    request: FastifyRequest<{ Params: { dashboardId: string } }>,
    reply: FastifyReply
  ) => {
    const deleted = await observabilityService.deleteDashboard(request.params.dashboardId);
    if (!deleted) {
      return reply.status(404).send({ error: 'Dashboard not found' });
    }
    return reply.send({ success: true });
  });
}

export default observabilityRoutes;
