// ===========================================
// DATABASE ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DatabaseType } from '@prisma/client';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { projectAccessFilter, projectWhereForUser } from '@/lib/project-access.js';
import { randomBytes } from 'crypto';
import { sendDeploymentEvent } from '@/lib/kafka.js';
import { createAuditLog } from '@/services/audit/index.js';

const logger = createLogger('databases');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createDatabaseSchema = z.object({
  name: z.string().min(1).max(63).regex(/^[a-z][a-z0-9_]*$/, 'Name must start with lowercase letter and contain only a-z, 0-9, _'),
  type: z.enum(['POSTGRES', 'POSTGRESQL', 'MYSQL', 'MONGODB', 'REDIS']),
  version: z.string().optional(),
});
const createDatabaseWithProjectSchema = createDatabaseSchema.extend({
  projectId: z.string().optional(),
});

const updateDatabaseSchema = z.object({
  name: z.string().min(1).max(63).regex(/^[a-z][a-z0-9_]*$/).optional(),
});

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  type: z.enum(['POSTGRES', 'POSTGRESQL', 'MYSQL', 'MONGODB', 'REDIS']).optional(),
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function generateCredentials(): { username: string; password: string } {
  const username = `zyphron_${randomBytes(4).toString('hex')}`;
  const password = randomBytes(24).toString('base64url');
  return { username, password };
}

function normalizeDbType(type: 'POSTGRES' | 'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS'): DatabaseType {
  return type === 'POSTGRES' ? 'POSTGRESQL' : type;
}

function generateConnectionString(
  type: string,
  host: string,
  port: number,
  username: string,
  password: string,
  database: string
): string {
  switch (type) {
    case 'POSTGRES':
    case 'POSTGRESQL':
      return `postgresql://${username}:${password}@${host}:${port}/${database}`;
    case 'MYSQL':
      return `mysql://${username}:${password}@${host}:${port}/${database}`;
    case 'MONGODB':
      return `mongodb://${username}:${password}@${host}:${port}/${database}`;
    case 'REDIS':
      return `redis://:${password}@${host}:${port}`;
    default:
      return '';
  }
}

function getDefaultPort(type: string): number {
  switch (type) {
    case 'POSTGRES':
    case 'POSTGRESQL': return 5432;
    case 'MYSQL': return 3306;
    case 'MONGODB': return 27017;
    case 'REDIS': return 6379;
    default: return 5432;
  }
}

function getDefaultVersion(type: string): string {
  switch (type) {
    case 'POSTGRES':
    case 'POSTGRESQL': return '15';
    case 'MYSQL': return '8.0';
    case 'MONGODB': return '7.0';
    case 'REDIS': return '7.2';
    default: return 'latest';
  }
}

// ===========================================
// ROUTES
// ===========================================

export async function databaseRoutes(app: FastifyInstance): Promise<void> {
  // List all databases for user
  app.get('/databases', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const query = querySchema.parse(request.query);
    const normalizedType = query.type ? normalizeDbType(query.type) : undefined;

    const where = {
      project: {
        OR: [
          { userId },
          { team: { members: { some: { userId } } } },
        ],
      },
      ...(normalizedType && { type: normalizedType }),
    };

    const [databases, total] = await Promise.all([
      prisma.database.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),
      prisma.database.count({ where }),
    ]);

    // Mask sensitive data
    const maskedDatabases = databases.map(db => ({
      ...db,
      password: '••••••••',
      connectionString: db.connectionString?.replace(/:[^:@]+@/, ':••••••••@') ?? null,
    }));

    return reply.send({
      success: true,
      data: { databases: maskedDatabases },
      meta: {
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
          hasNext: query.page * query.limit < total,
          hasPrev: query.page > 1,
        },
      },
    });
  });

  // List databases for a specific project
  app.get('/projects/:projectId/databases', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;

    // Check project access
    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId),
    });

    if (!project) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or you do not have access',
        },
      });
    }

    const databases = await prisma.database.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
    });

    // Mask sensitive data
    const maskedDatabases = databases.map(db => ({
      ...db,
      password: '••••••••',
      connectionString: db.connectionString?.replace(/:[^:@]+@/, ':••••••••@') ?? null,
    }));

    return reply.send({
      success: true,
      data: { databases: maskedDatabases },
    });
  });

  // Create database for a project
  app.post('/projects/:projectId/databases', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    
    const parseResult = createDatabaseSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
      });
    }

    const data = parseResult.data;

    // Check project access
    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId, ['OWNER', 'ADMIN']),
    });

    if (!project) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or you do not have permission',
        },
      });
    }

    // Check for duplicate name
    const existing = await prisma.database.findFirst({
      where: {
        projectId: project.id,
        name: data.name,
      },
    });

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'DUPLICATE_DATABASE',
          message: 'A database with this name already exists in this project',
        },
      });
    }

    // Generate credentials
    const normalizedType = normalizeDbType(data.type);
    const { username, password } = generateCredentials();
    const port = getDefaultPort(normalizedType);
    const version = data.version || getDefaultVersion(normalizedType);
    
    // In production, this would be the actual database host
    const host = process.env.DATABASE_HOST || 'localhost';
    
    const connectionString = generateConnectionString(
      normalizedType,
      host,
      port,
      username,
      password,
      data.name
    );

    const database = await prisma.database.create({
      data: {
        name: data.name,
        type: normalizedType,
        version,
        host,
        port,
        username,
        password, // In production, this should be encrypted
        connectionString,
        status: 'PROVISIONING',
        projectId: project.id,
      },
    });

    try {
      await sendDeploymentEvent(database.id, 'DATABASE_PROVISION_REQUESTED', {
        databaseId: database.id,
        projectId: project.id,
        userId,
        databaseType: database.type,
        databaseName: database.name,
      });
    } catch (error) {
      logger.warn({ databaseId: database.id, error }, 'Failed to enqueue database provisioning event');
    }
    await createAuditLog({
      userId,
      action: 'database.create',
      resourceType: 'database',
      resourceId: database.id,
      metadata: {
        projectId: project.id,
        type: database.type,
        name: database.name,
      },
      request,
    });

    logger.info({
      databaseId: database.id,
      projectId: project.id,
      type: data.type,
      userId,
    }, 'Database provisioning requested');

    return reply.status(201).send({
      success: true,
      data: {
        database: {
          ...database,
          password: '••••••••',
          connectionString: connectionString.replace(/:[^:@]+@/, ':••••••••@'),
        },
      },
    });
  });

  // Compatibility endpoint: create database without project in path.
  // If projectId is omitted and only one accessible project exists, use it.
  app.post('/databases', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const parseResult = createDatabaseWithProjectSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
      });
    }

    const data = parseResult.data;
    let projectIdentifier = data.projectId;

    if (!projectIdentifier) {
      const projects = await prisma.project.findMany({
        where: projectAccessFilter(userId, ['OWNER', 'ADMIN']),
        select: { id: true },
        take: 2,
      });

      if (projects.length === 0) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'PROJECT_REQUIRED',
            message: 'No accessible project found. Provide projectId.',
          },
        });
      }

      if (projects.length > 1) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'PROJECT_AMBIGUOUS',
            message: 'Multiple projects found. Provide projectId explicitly.',
          },
        });
      }

      projectIdentifier = projects[0].id;
    }

    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectIdentifier, userId, ['OWNER', 'ADMIN']),
    });

    if (!project) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or you do not have permission',
        },
      });
    }

    const existing = await prisma.database.findFirst({
      where: {
        projectId: project.id,
        name: data.name,
      },
    });

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'DUPLICATE_DATABASE',
          message: 'A database with this name already exists in this project',
        },
      });
    }

    const normalizedType = normalizeDbType(data.type);
    const { username, password } = generateCredentials();
    const port = getDefaultPort(normalizedType);
    const version = data.version || getDefaultVersion(normalizedType);
    const host = process.env.DATABASE_HOST || 'localhost';
    const connectionString = generateConnectionString(
      normalizedType,
      host,
      port,
      username,
      password,
      data.name
    );

    const database = await prisma.database.create({
      data: {
        name: data.name,
        type: normalizedType,
        version,
        host,
        port,
        username,
        password,
        connectionString,
        status: 'PROVISIONING',
        projectId: project.id,
      },
    });
    try {
      await sendDeploymentEvent(database.id, 'DATABASE_PROVISION_REQUESTED', {
        databaseId: database.id,
        projectId: project.id,
        userId,
        databaseType: database.type,
        databaseName: database.name,
      });
    } catch (error) {
      logger.warn({ databaseId: database.id, error }, 'Failed to enqueue database provisioning event');
    }
    await createAuditLog({
      userId,
      action: 'database.create',
      resourceType: 'database',
      resourceId: database.id,
      metadata: {
        projectId: project.id,
        type: database.type,
        name: database.name,
      },
      request,
    });

    logger.info({
      databaseId: database.id,
      projectId: project.id,
      type: data.type,
      userId,
    }, 'Database provisioning requested');

    return reply.status(201).send({
      success: true,
      data: {
        database: {
          ...database,
          password: '••••••••',
          connectionString: connectionString.replace(/:[^:@]+@/, ':••••••••@'),
        },
      },
    });
  });

  // Get single database
  app.get('/databases/:databaseId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { databaseId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { databaseId } = request.params;

    const database = await prisma.database.findFirst({
      where: {
        id: databaseId,
        project: {
          OR: [
            { userId },
            { team: { members: { some: { userId } } } },
          ],
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!database) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'DATABASE_NOT_FOUND',
          message: 'Database not found or you do not have access',
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        database: {
          ...database,
          password: '••••••••',
          connectionString: database.connectionString?.replace(/:[^:@]+@/, ':••••••••@') ?? null,
        },
      },
    });
  });

  // Get database credentials (reveal password)
  app.get('/databases/:databaseId/credentials', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { databaseId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { databaseId } = request.params;

    const database = await prisma.database.findFirst({
      where: {
        id: databaseId,
        project: {
          OR: [
            { userId },
            { team: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
          ],
        },
      },
    });

    if (!database) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'DATABASE_NOT_FOUND',
          message: 'Database not found or you do not have permission',
        },
      });
    }

    logger.info({ databaseId, userId }, 'Database credentials accessed');

    return reply.send({
      success: true,
      data: {
        credentials: {
          host: database.host,
          port: database.port,
          username: database.username,
          password: database.password,
          database: database.name,
          connectionString: database.connectionString,
        },
      },
    });
  });

  // Update database
  app.put('/databases/:databaseId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { databaseId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { databaseId } = request.params;
    
    const parseResult = updateDatabaseSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
      });
    }

    const data = parseResult.data;

    // Check access
    const existing = await prisma.database.findFirst({
      where: {
        id: databaseId,
        project: {
          OR: [
            { userId },
            { team: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
          ],
        },
      },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'DATABASE_NOT_FOUND',
          message: 'Database not found or you do not have permission',
        },
      });
    }

    const database = await prisma.database.update({
      where: { id: databaseId },
      data,
    });
    await createAuditLog({
      userId,
      action: 'database.update',
      resourceType: 'database',
      resourceId: databaseId,
      metadata: {
        projectId: existing.projectId,
        updatedFields: Object.keys(data),
      },
      request,
    });

    logger.info({ databaseId, userId }, 'Database updated');

    return reply.send({
      success: true,
      data: {
        database: {
          ...database,
          password: '••••••••',
          connectionString: database.connectionString?.replace(/:[^:@]+@/, ':••••••••@') ?? null,
        },
      },
    });
  });

  // Delete database
  app.delete('/databases/:databaseId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { databaseId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { databaseId } = request.params;

    // Check access (only owner/admin can delete)
    const existing = await prisma.database.findFirst({
      where: {
        id: databaseId,
        project: {
          OR: [
            { userId },
            { team: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
          ],
        },
      },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'DATABASE_NOT_FOUND',
          message: 'Database not found or you do not have permission',
        },
      });
    }

    try {
      await sendDeploymentEvent(existing.id, 'DATABASE_DELETE_REQUESTED', {
        databaseId: existing.id,
        projectId: existing.projectId,
        userId,
        databaseType: existing.type,
        databaseName: existing.name,
      });
    } catch (error) {
      logger.warn({ databaseId: existing.id, error }, 'Failed to enqueue database deletion event');
    }

    await prisma.database.delete({
      where: { id: databaseId },
    });
    await createAuditLog({
      userId,
      action: 'database.delete',
      resourceType: 'database',
      resourceId: databaseId,
      metadata: {
        projectId: existing.projectId,
        type: existing.type,
        name: existing.name,
      },
      request,
    });

    logger.info({ databaseId, userId, type: existing.type }, 'Database deleted');

    return reply.send({
      success: true,
      data: { message: 'Database deleted successfully' },
    });
  });

  // Reset database password
  app.post('/databases/:databaseId/reset-password', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { databaseId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { databaseId } = request.params;

    // Check access
    const existing = await prisma.database.findFirst({
      where: {
        id: databaseId,
        project: {
          OR: [
            { userId },
            { team: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
          ],
        },
      },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'DATABASE_NOT_FOUND',
          message: 'Database not found or you do not have permission',
        },
      });
    }

    // Generate new password
    const newPassword = randomBytes(24).toString('base64url');
    const newConnectionString = generateConnectionString(
      existing.type,
      existing.host || 'localhost',
      existing.port || getDefaultPort(existing.type),
      existing.username || 'zyphron',
      newPassword,
      existing.name
    );

    const database = await prisma.database.update({
      where: { id: databaseId },
      data: {
        password: newPassword,
        connectionString: newConnectionString,
      },
    });

    try {
      await sendDeploymentEvent(database.id, 'DATABASE_PASSWORD_ROTATE_REQUESTED', {
        databaseId: database.id,
        projectId: database.projectId,
        userId,
      });
    } catch (error) {
      logger.warn({ databaseId: database.id, error }, 'Failed to enqueue database password rotation event');
    }
    await createAuditLog({
      userId,
      action: 'database.update',
      resourceType: 'database',
      resourceId: databaseId,
      metadata: {
        projectId: existing.projectId,
        operation: 'password_reset',
      },
      request,
    });

    logger.info({ databaseId, userId }, 'Database password reset');

    return reply.send({
      success: true,
      data: {
        credentials: {
          host: database.host,
          port: database.port,
          username: database.username,
          password: newPassword,
          database: database.name,
          connectionString: newConnectionString,
        },
      },
    });
  });

  app.get('/databases/:databaseId/connection', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { databaseId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { databaseId } = request.params;

    const database = await prisma.database.findFirst({
      where: {
        id: databaseId,
        project: {
          OR: [
            { userId },
            { team: { members: { some: { userId } } } },
          ],
        },
      },
      select: {
        id: true,
        connectionString: true,
      },
    });

    if (!database) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'DATABASE_NOT_FOUND',
          message: 'Database not found or you do not have access',
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        connectionString: database.connectionString,
      },
    });
  });
}
