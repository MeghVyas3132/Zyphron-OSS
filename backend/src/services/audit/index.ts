// ===========================================
// AUDIT LOGGING SERVICE
// ===========================================

import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';

const logger = createLogger('audit');

// ===========================================
// TYPES
// ===========================================

export type AuditAction = 
  // Auth
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  // Projects
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  | 'project.transfer'
  // Deployments
  | 'deployment.trigger'
  | 'deployment.cancel'
  | 'deployment.rollback'
  // Services
  | 'service.create'
  | 'service.update'
  | 'service.delete'
  // Environment Variables
  | 'env.create'
  | 'env.update'
  | 'env.delete'
  // Domains
  | 'domain.add'
  | 'domain.remove'
  | 'domain.verify'
  // Webhooks
  | 'webhook.create'
  | 'webhook.update'
  | 'webhook.delete'
  | 'webhook.regenerate_secret'
  // Teams
  | 'team.create'
  | 'team.update'
  | 'team.delete'
  | 'team.member_add'
  | 'team.member_remove'
  | 'team.member_role_update'
  | 'team.ownership_transfer'
  // API Keys
  | 'api_key.create'
  | 'api_key.delete'
  | 'api_key.update'
  // Databases
  | 'database.create'
  | 'database.delete'
  | 'database.update';

export type ResourceType = 
  | 'user'
  | 'project'
  | 'deployment'
  | 'service'
  | 'env_variable'
  | 'domain'
  | 'webhook'
  | 'team'
  | 'team_member'
  | 'api_key'
  | 'database';

export interface AuditLogInput {
  userId?: string | null;
  action: AuditAction | string;
  resourceType: ResourceType | string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  request?: FastifyRequest;
}

// ===========================================
// AUDIT LOGGING FUNCTIONS
// ===========================================

/**
 * Create an audit log entry
 */
export async function createAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const ipAddress = input.request?.headers['x-forwarded-for']?.toString() || 
                      input.request?.ip || 
                      null;
    const userAgent = input.request?.headers['user-agent'] || null;

    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        ipAddress,
        userAgent,
      },
    });

    logger.debug({
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      userId: input.userId,
    }, 'Audit log created');
  } catch (error) {
    // Don't throw - audit logging should not break the main flow
    logger.error({ error, input }, 'Failed to create audit log');
  }
}

/**
 * Helper to extract user ID from request
 */
export function getUserIdFromRequest(request: FastifyRequest): string | null {
  return (request as FastifyRequest & { user?: { id?: string } }).user?.id || null;
}

/**
 * Audit helper for use in route handlers
 */
export function audit(request: FastifyRequest) {
  const userId = getUserIdFromRequest(request);
  
  return {
    log: (action: AuditAction | string, resourceType: ResourceType | string, resourceId?: string | null, metadata?: Record<string, unknown>) => {
      createAuditLog({
        userId,
        action,
        resourceType,
        resourceId,
        metadata,
        request,
      });
    },
  };
}

// ===========================================
// QUERY FUNCTIONS
// ===========================================

export interface AuditLogQuery {
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export async function queryAuditLogs(query: AuditLogQuery) {
  const {
    userId,
    resourceType,
    resourceId,
    action,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = query;

  const where: Record<string, unknown> = {};

  if (userId) where.userId = userId;
  if (resourceType) where.resourceType = resourceType;
  if (resourceId) where.resourceId = resourceId;
  if (action) where.action = { contains: action };
  
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
    if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
