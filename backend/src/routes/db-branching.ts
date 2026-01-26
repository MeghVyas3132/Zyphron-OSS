// ===========================================
// DATABASE BRANCHING ROUTES
// Database branching for preview environments
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { databaseBranchingService, DatabaseType } from '../services/database/branching.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('db-branching-routes');

export async function dbBranchingRoutes(fastify: FastifyInstance) {
  // Create database branch
  fastify.post('/projects/:projectId/db-branches', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: {
        parentDatabaseId: string;
        name: string;
        type: DatabaseType;
        expirationHours?: number;
        copyData?: boolean;
        metadata?: Record<string, unknown>;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const branch = await databaseBranchingService.createBranch({
        projectId: request.params.projectId,
        parentDatabaseId: request.body.parentDatabaseId,
        name: request.body.name,
        type: request.body.type,
        expirationHours: request.body.expirationHours,
        copyData: request.body.copyData ?? true,
        metadata: request.body.metadata,
      });
      logger.info({ branchId: branch.id, projectId: request.params.projectId }, 'Database branch created');
      return reply.status(201).send(branch);
    } catch (error) {
      logger.error({ error }, 'Failed to create database branch');
      return reply.status(500).send({ error: 'Failed to create database branch' });
    }
  });

  // Create branch for PR
  fastify.post('/projects/:projectId/db-branches/preview', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: {
        prNumber: number;
        branchName: string;
        parentDatabaseId: string;
        type: DatabaseType;
        createdBy: string;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const branch = await databaseBranchingService.createPreviewBranch({
        projectId: request.params.projectId,
        ...request.body,
      });
      logger.info({ branchId: branch.id, prNumber: request.body.prNumber }, 'Preview database branch created');
      return reply.status(201).send(branch);
    } catch (error) {
      logger.error({ error }, 'Failed to create preview database branch');
      return reply.status(500).send({ error: 'Failed to create preview branch' });
    }
  });

  // Get project branches
  fastify.get('/projects/:projectId/db-branches', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const branches = await databaseBranchingService.getProjectBranches(request.params.projectId);
    return reply.send({ branches });
  });

  // Get branch by ID
  fastify.get('/db-branches/:branchId', async (
    request: FastifyRequest<{ Params: { branchId: string } }>,
    reply: FastifyReply
  ) => {
    const branch = await databaseBranchingService.getBranch(request.params.branchId);
    if (!branch) {
      return reply.status(404).send({ error: 'Branch not found' });
    }
    return reply.send(branch);
  });

  // Get branch by PR number
  fastify.get('/projects/:projectId/db-branches/pr/:prNumber', async (
    request: FastifyRequest<{ Params: { projectId: string; prNumber: string } }>,
    reply: FastifyReply
  ) => {
    const branch = await databaseBranchingService.getBranchByPR(
      request.params.projectId,
      parseInt(request.params.prNumber, 10)
    );
    if (!branch) {
      return reply.status(404).send({ error: 'Branch not found for this PR' });
    }
    return reply.send(branch);
  });

  // Sync branch with parent
  fastify.post('/db-branches/:branchId/sync', async (
    request: FastifyRequest<{
      Params: { branchId: string };
      Body: {
        tables?: string[];
        excludeTables?: string[];
        schemaOnly?: boolean;
      }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const result = await databaseBranchingService.syncBranch({
        branchId: request.params.branchId,
        ...request.body,
      });
      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Failed to sync database branch');
      return reply.status(500).send({ error: 'Failed to sync branch' });
    }
  });

  // Run migrations on branch
  fastify.post('/db-branches/:branchId/migrate', async (
    request: FastifyRequest<{
      Params: { branchId: string };
      Body: { migrations: string[] }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const result = await databaseBranchingService.runMigrations(
        request.params.branchId,
        request.body.migrations
      );
      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Failed to run migrations');
      return reply.status(500).send({ error: 'Failed to run migrations' });
    }
  });

  // Get connection info
  fastify.get('/db-branches/:branchId/connection', async (
    request: FastifyRequest<{ Params: { branchId: string } }>,
    reply: FastifyReply
  ) => {
    const info = await databaseBranchingService.getConnectionInfo(request.params.branchId);
    if (!info) {
      return reply.status(404).send({ error: 'Branch not found or not ready' });
    }
    return reply.send(info);
  });

  // Delete branch
  fastify.delete('/db-branches/:branchId', async (
    request: FastifyRequest<{ Params: { branchId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const deleted = await databaseBranchingService.deleteBranch(request.params.branchId);
      if (!deleted) {
        return reply.status(404).send({ error: 'Branch not found' });
      }
      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to delete database branch');
      return reply.status(500).send({ error: 'Failed to delete branch' });
    }
  });

  // Delete PR branches
  fastify.delete('/projects/:projectId/db-branches/pr/:prNumber', async (
    request: FastifyRequest<{ Params: { projectId: string; prNumber: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const deleted = await databaseBranchingService.deletePRBranches(
        request.params.projectId,
        parseInt(request.params.prNumber, 10)
      );
      return reply.send({ success: true, deletedCount: deleted });
    } catch (error) {
      logger.error({ error }, 'Failed to delete PR branches');
      return reply.status(500).send({ error: 'Failed to delete PR branches' });
    }
  });

  // Cleanup expired branches
  fastify.post('/db-branches/cleanup', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cleaned = await databaseBranchingService.cleanupExpiredBranches();
      return reply.send({ success: true, cleanedCount: cleaned });
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup expired branches');
      return reply.status(500).send({ error: 'Failed to cleanup branches' });
    }
  });

  // Get branch stats
  fastify.get('/projects/:projectId/db-branches/stats', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const stats = await databaseBranchingService.getBranchStats(request.params.projectId);
    return reply.send(stats);
  });
}

export default dbBranchingRoutes;
