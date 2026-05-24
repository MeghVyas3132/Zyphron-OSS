// ===========================================
// MULTI-CLOUD ROUTES — DISABLED
// Multi-cloud deployment has been removed to keep the platform
// focused on the single-node K8s (K3s) deployment model.
// All endpoints return 501 Not Implemented.
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '@/lib/logger.js';

const logger = createLogger('cloud-routes');

const NOT_IMPLEMENTED = { error: 'Multi-cloud deployment is not enabled on this instance.' };

export async function cloudRoutes(app: FastifyInstance): Promise<void> {
  // Catch-all: any /cloud/* route → 501
  app.all('/*', {
    onRequest: [app.authenticate],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    logger.debug('Multi-cloud route called — returning 501');
    return reply.status(501).send(NOT_IMPLEMENTED);
  });
}
