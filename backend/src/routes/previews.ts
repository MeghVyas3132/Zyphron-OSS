import { FastifyPluginAsync } from 'fastify';
import { previewService, PreviewEnvironment, PullRequestEvent } from '../services/preview/index.js';
import { logger } from '../lib/logger.js';

interface CreatePreviewBody {
  pullRequestNumber: number;
  pullRequestTitle: string;
  branch: string;
  commitSha: string;
  headRef: string;
  baseRef: string;
}

interface UpdatePreviewBody {
  commitSha: string;
}

interface PRWebhookBody {
  action: 'opened' | 'synchronize' | 'closed' | 'reopened';
  number: number;
  pull_request: {
    title: string;
    head: { ref: string; sha: string };
    base: { ref: string };
    user: { login: string };
  };
  repository: { full_name: string; clone_url: string };
}

export const previewRoutes: FastifyPluginAsync = async (fastify) => {
  // List preview environments
  fastify.get<{ Params: { projectId: string }; Querystring: { status?: string } }>(
    '/:projectId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { projectId } = request.params;
      const { status } = request.query;
      try {
        const previews = await previewService.getProjectPreviews(projectId);
        const filtered = status
          ? previews.filter((p: PreviewEnvironment) => p.status === status)
          : previews;
        return reply.send({ success: true, data: filtered, meta: { total: filtered.length } });
      } catch (error) {
        logger.error({ error, projectId }, 'Failed to list preview environments');
        return reply.status(500).send({ success: false, error: 'Failed to list preview environments' });
      }
    }
  );

  // Create preview environment
  fastify.post<{ Params: { projectId: string }; Body: CreatePreviewBody }>(
    '/:projectId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { projectId } = request.params;
      const body = request.body;
      try {
        const preview = await previewService.createPreviewEnvironment({ projectId, ...body });
        return reply.status(201).send({ success: true, data: preview, message: 'Preview environment created' });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create preview environment';
        logger.error({ error, projectId, prNumber: body.pullRequestNumber }, 'Failed to create preview environment');
        return reply.status(400).send({ success: false, error: errorMessage });
      }
    }
  );

  // Get specific preview environment
  fastify.get<{ Params: { projectId: string; prNumber: string } }>(
    '/:projectId/:prNumber',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { projectId, prNumber } = request.params;
      try {
        const preview = await previewService.getPreviewByPR(projectId, parseInt(prNumber, 10));
        if (!preview) {
          return reply.status(404).send({ success: false, error: 'Preview environment not found' });
        }
        return reply.send({ success: true, data: preview });
      } catch (error) {
        logger.error({ error, projectId, prNumber }, 'Failed to get preview environment');
        return reply.status(500).send({ success: false, error: 'Failed to get preview environment' });
      }
    }
  );

  // Update preview environment
  fastify.patch<{ Params: { projectId: string; prNumber: string }; Body: UpdatePreviewBody }>(
    '/:projectId/:prNumber',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { projectId, prNumber } = request.params;
      const { commitSha } = request.body;
      try {
        const preview = await previewService.updatePreviewEnvironment(projectId, parseInt(prNumber, 10), commitSha);
        return reply.send({ success: true, data: preview, message: 'Preview environment updated' });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to update preview environment';
        logger.error({ error, projectId, prNumber }, 'Failed to update preview environment');
        if (errorMessage === 'Preview environment not found') {
          return reply.status(404).send({ success: false, error: 'Preview environment not found' });
        }
        return reply.status(400).send({ success: false, error: errorMessage });
      }
    }
  );

  // Update preview status
  fastify.patch<{ Params: { projectId: string; prNumber: string }; Body: { status: string; deploymentUrl?: string } }>(
    '/:projectId/:prNumber/status',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { projectId, prNumber } = request.params;
      const { status, deploymentUrl } = request.body;
      try {
        const preview = await previewService.updatePreviewStatus(
          projectId,
          parseInt(prNumber, 10),
          status as 'pending' | 'building' | 'ready' | 'failed' | 'expired',
          deploymentUrl
        );
        if (!preview) {
          return reply.status(404).send({ success: false, error: 'Preview environment not found' });
        }
        return reply.send({ success: true, data: preview, message: 'Preview status updated' });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to update preview status';
        logger.error({ error, projectId, prNumber }, 'Failed to update preview status');
        return reply.status(400).send({ success: false, error: errorMessage });
      }
    }
  );

  // Delete preview environment
  fastify.delete<{ Params: { projectId: string; prNumber: string } }>(
    '/:projectId/:prNumber',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { projectId, prNumber } = request.params;
      try {
        await previewService.deletePreviewEnvironment(projectId, parseInt(prNumber, 10));
        return reply.status(204).send();
      } catch (error) {
        logger.error({ error, projectId, prNumber }, 'Failed to delete preview environment');
        return reply.status(500).send({ success: false, error: 'Failed to delete preview environment' });
      }
    }
  );

  // GitHub webhook for PR events
  fastify.post<{ Params: { projectId: string }; Body: PRWebhookBody }>(
    '/:projectId/webhook/github',
    async (request, reply) => {
      const { projectId } = request.params;
      const event = request.headers['x-github-event'];

      if (event !== 'pull_request') {
        return reply.send({ success: true, message: 'Event ignored' });
      }

      const body = request.body;
      try {
        const prEvent: PullRequestEvent = {
          action: body.action,
          number: body.number,
          title: body.pull_request.title,
          head: { ref: body.pull_request.head.ref, sha: body.pull_request.head.sha },
          base: { ref: body.pull_request.base.ref },
          repository: { full_name: body.repository.full_name, clone_url: body.repository.clone_url },
        };
        const preview = await previewService.handlePullRequestEvent(projectId, prEvent);
        return reply.send({ success: true, data: preview, message: 'PR ' + body.action + ' handled' });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to handle webhook';
        logger.error({ error, projectId, action: body.action }, 'Failed to handle PR webhook');
        return reply.status(400).send({ success: false, error: errorMessage });
      }
    }
  );

  // Cleanup expired previews
  fastify.post('/cleanup', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    try {
      const cleaned = await previewService.cleanupExpiredPreviews();
      return reply.send({ success: true, data: { cleaned }, message: 'Cleaned up ' + cleaned + ' expired preview environments' });
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup expired previews');
      return reply.status(500).send({ success: false, error: 'Failed to cleanup expired previews' });
    }
  });

  // Get preview statistics
  fastify.get<{ Params: { projectId: string } }>(
    '/:projectId/stats',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { projectId } = request.params;
      try {
        const previews = await previewService.getProjectPreviews(projectId);
        const stats = {
          total: previews.length,
          byStatus: {
            pending: previews.filter((p: PreviewEnvironment) => p.status === 'pending').length,
            building: previews.filter((p: PreviewEnvironment) => p.status === 'building').length,
            ready: previews.filter((p: PreviewEnvironment) => p.status === 'ready').length,
            failed: previews.filter((p: PreviewEnvironment) => p.status === 'failed').length,
            expired: previews.filter((p: PreviewEnvironment) => p.status === 'expired').length,
          },
          activeDeployments: previews.filter((p: PreviewEnvironment) => ['pending', 'building', 'ready'].includes(p.status)).length,
        };
        return reply.send({ success: true, data: stats });
      } catch (error) {
        logger.error({ error, projectId }, 'Failed to get preview stats');
        return reply.status(500).send({ success: false, error: 'Failed to get preview statistics' });
      }
    }
  );
};

export default previewRoutes;
