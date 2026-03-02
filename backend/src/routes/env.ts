// ===========================================
// ENVIRONMENT VARIABLES ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Environment } from '@prisma/client';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { TEAM_ROLES_WRITE, projectWhereForUser } from '@/lib/project-access.js';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const logger = createLogger('env');

// Encryption key (in production, this should be from secure vault)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'zyphron-dev-encryption-key-32ch';
const ALGORITHM = 'aes-256-gcm';

// ===========================================
// ENCRYPTION UTILITIES
// ===========================================

function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf-8').subarray(0, 32), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf-8').subarray(0, 32), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createEnvSchema = z.object({
  key: z.string()
    .min(1)
    .max(255)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Key must start with uppercase letter and contain only A-Z, 0-9, _'),
  value: z.string().max(65535),
  environment: z.enum(['production', 'preview', 'staging', 'development']).default('production'),
  isSecret: z.boolean().default(false),
});

const updateEnvSchema = z.object({
  value: z.string().max(65535).optional(),
  environment: z.enum(['production', 'preview', 'staging', 'development']).optional(),
  isSecret: z.boolean().optional(),
});

const bulkCreateSchema = z.object({
  variables: z.array(createEnvSchema).min(1).max(100),
  overwrite: z.boolean().default(false),
});

const parseEnvFileSchema = z.object({
  content: z.string(),
  environment: z.enum(['production', 'preview', 'staging', 'development']).default('production'),
});

type InputEnvironment = 'production' | 'preview' | 'staging' | 'development';

function toPrismaEnvironment(environment: InputEnvironment): Environment {
  switch (environment) {
    case 'production':
      return 'PRODUCTION';
    case 'preview':
      return 'PREVIEW';
    case 'staging':
      return 'STAGING';
    case 'development':
      return 'DEVELOPMENT';
  }
}

// ===========================================
// ROUTES
// ===========================================

export async function envRoutes(app: FastifyInstance): Promise<void> {
  // List environment variables for a project
  app.get('/projects/:projectId/env', {
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

    const envVariables = await prisma.envVariable.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        key: true,
        value: true,
        environment: true,
        isSecret: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { environment: 'asc' },
        { key: 'asc' },
      ],
    });

    // Mask secret values
    const maskedVariables = envVariables.map(v => ({
      ...v,
      value: v.isSecret ? '••••••••' : decrypt(v.value),
    }));

    return reply.send({
      success: true,
      data: { envVariables: maskedVariables },
    });
  });

  // Create environment variable
  app.post('/projects/:projectId/env', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    
    const parseResult = createEnvSchema.safeParse(request.body);

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
    const prismaEnvironment = toPrismaEnvironment(data.environment);

    // Check project access
    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId, ['OWNER', 'ADMIN', 'DEVELOPER']),
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

    // Check for duplicate key in same environment
    const existing = await prisma.envVariable.findFirst({
      where: {
        projectId: project.id,
        key: data.key,
        environment: prismaEnvironment,
      },
    });

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'DUPLICATE_KEY',
          message: `Environment variable ${data.key} already exists for ${data.environment}`,
        },
      });
    }

    const envVariable = await prisma.envVariable.create({
      data: {
        projectId: project.id,
        key: data.key,
        value: encrypt(data.value),
        environment: prismaEnvironment,
        isSecret: data.isSecret,
      },
    });

    logger.info({ projectId, key: data.key, environment: prismaEnvironment, userId }, 'Environment variable created');

    return reply.status(201).send({
      success: true,
      data: {
        envVariable: {
          id: envVariable.id,
          key: envVariable.key,
          value: envVariable.isSecret ? '••••••••' : data.value,
          environment: envVariable.environment,
          isSecret: envVariable.isSecret,
          createdAt: envVariable.createdAt,
          updatedAt: envVariable.updatedAt,
        },
      },
    });
  });

  // Bulk create environment variables
  app.post('/projects/:projectId/env/bulk', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    
    const parseResult = bulkCreateSchema.safeParse(request.body);

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

    const { variables, overwrite } = parseResult.data;

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

    const results = {
      created: [] as string[],
      updated: [] as string[],
      skipped: [] as string[],
    };

    for (const variable of variables) {
      const prismaEnvironment = toPrismaEnvironment(variable.environment);
      const existing = await prisma.envVariable.findFirst({
        where: {
          projectId: project.id,
          key: variable.key,
          environment: prismaEnvironment,
        },
      });

      if (existing) {
        if (overwrite) {
          await prisma.envVariable.update({
            where: { id: existing.id },
            data: {
              value: encrypt(variable.value),
              environment: prismaEnvironment,
              isSecret: variable.isSecret,
            },
          });
          results.updated.push(`${variable.key} (${variable.environment})`);
        } else {
          results.skipped.push(`${variable.key} (${variable.environment})`);
        }
      } else {
        await prisma.envVariable.create({
          data: {
            projectId: project.id,
            key: variable.key,
            value: encrypt(variable.value),
            environment: prismaEnvironment,
            isSecret: variable.isSecret,
          },
        });
        results.created.push(`${variable.key} (${variable.environment})`);
      }
    }

    logger.info({ projectId: project.id, userId, ...results }, 'Bulk environment variables operation');

    return reply.send({
      success: true,
      data: { results },
    });
  });

  // Parse .env file content
  app.post('/projects/:projectId/env/parse', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    const parseResult = parseEnvFileSchema.safeParse(request.body);

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

    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId, TEAM_ROLES_WRITE),
      select: { id: true },
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

    const { content, environment } = parseResult.data;

    // Parse .env format
    const lines = content.split('\n');
    const variables: Array<{ key: string; value: string; environment: string; isSecret: boolean }> = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and comments
      if (!line || line.startsWith('#')) continue;

      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match) {
        let [, key, value] = match;
        
        // Handle quoted values
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        // Detect if likely a secret
        const isSecret = /password|secret|key|token|api[_-]?key/i.test(key);

        variables.push({ key, value, environment, isSecret });
      } else if (line.includes('=')) {
        errors.push(`Line ${i + 1}: Invalid variable format - "${line}"`);
      }
    }

    return reply.send({
      success: true,
      data: {
        variables,
        errors,
        parsed: variables.length,
        errorCount: errors.length,
      },
    });
  });

  // Update environment variable
  app.put('/projects/:projectId/env/:envId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; envId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, envId } = request.params;
    
    const parseResult = updateEnvSchema.safeParse(request.body);

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
      where: projectWhereForUser(projectId, userId, ['OWNER', 'ADMIN', 'DEVELOPER']),
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

    const existing = await prisma.envVariable.findFirst({
      where: {
        id: envId,
        projectId: project.id,
      },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'ENV_NOT_FOUND',
          message: 'Environment variable not found',
        },
      });
    }

    const envVariable = await prisma.envVariable.update({
      where: { id: envId },
      data: {
        ...(data.value !== undefined && { value: encrypt(data.value) }),
        ...(data.environment !== undefined && { environment: toPrismaEnvironment(data.environment) }),
        ...(data.isSecret !== undefined && { isSecret: data.isSecret }),
      },
    });

    logger.info({ projectId: project.id, envId, key: existing.key, userId }, 'Environment variable updated');

    return reply.send({
      success: true,
      data: {
        envVariable: {
          id: envVariable.id,
          key: envVariable.key,
          value: envVariable.isSecret ? '••••••••' : (data.value ?? ''),
          environment: envVariable.environment,
          isSecret: envVariable.isSecret,
          createdAt: envVariable.createdAt,
          updatedAt: envVariable.updatedAt,
        },
      },
    });
  });

  // Delete environment variable
  app.delete('/projects/:projectId/env/:envId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; envId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, envId } = request.params;

    // Check project access
    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId, ['OWNER', 'ADMIN', 'DEVELOPER']),
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

    const existing = await prisma.envVariable.findFirst({
      where: {
        id: envId,
        projectId: project.id,
      },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'ENV_NOT_FOUND',
          message: 'Environment variable not found',
        },
      });
    }

    await prisma.envVariable.delete({
      where: { id: envId },
    });

    logger.info({ projectId: project.id, envId, key: existing.key, userId }, 'Environment variable deleted');

    return reply.send({
      success: true,
      data: { message: 'Environment variable deleted successfully' },
    });
  });

  // Get decrypted value (for internal use / build process)
  app.get('/projects/:projectId/env/export', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: { environment: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    const { environment } = request.query as { environment?: string };
    const prismaEnvironment = environment ? toPrismaEnvironment(environment as InputEnvironment) : undefined;

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

    const envVariables = await prisma.envVariable.findMany({
      where: {
        projectId: project.id,
        ...(prismaEnvironment && { environment: prismaEnvironment }),
      },
      orderBy: { key: 'asc' },
    });

    // Export in .env format
    const envContent = envVariables
      .map(v => `${v.key}=${decrypt(v.value)}`)
      .join('\n');

    // Return as downloadable file or JSON
    const format = (request.query as { format?: string }).format;
    
    if (format === 'file') {
      reply.header('Content-Type', 'text/plain');
      reply.header('Content-Disposition', `attachment; filename="${project.slug}.env"`);
      return reply.send(envContent);
    }

    return reply.send({
      success: true,
      data: {
        variables: envVariables.map(v => ({
          key: v.key,
          value: decrypt(v.value),
          environment: v.environment,
        })),
        envContent,
      },
    });
  });
}
