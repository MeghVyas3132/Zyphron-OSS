// ===========================================
// SECURITY MIDDLEWARE
// Production hardening for Zyphron API
// ===========================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import { createLogger } from '@/lib/logger.js';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma.js';

const logger = createLogger('security');

// ===========================================
// RATE LIMITING CONFIGURATION
// ===========================================

export const rateLimitConfig = {
  // General API rate limits
  global: {
    max: 1000,
    timeWindow: '1 hour',
  },
  
  // Auth-specific limits
  auth: {
    max: 10,
    timeWindow: '15 minutes',
  },
  
  // Deploy limits
  deploy: {
    max: 20,
    timeWindow: '1 hour',
  },
  
  // Webhook limits
  webhook: {
    max: 100,
    timeWindow: '1 minute',
  },
};

// ===========================================
// INPUT SANITIZATION
// ===========================================

/**
 * Sanitize a string to prevent XSS and injection attacks
 */
export function sanitizeString(input: string): string {
  if (!input) return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Validate slug format
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

// ===========================================
// API KEY AUTHENTICATION
// ===========================================

/**
 * Hash an API key for secure storage
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * API Key authentication middleware
 * Supports both JWT and API key authentication
 */
export async function apiKeyAuthentication(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return; // No auth header, let other handlers deal with it
  }

  // Check if it's an API key (starts with zk_)
  if (authHeader.startsWith('Bearer zk_')) {
    const key = authHeader.substring(7); // Remove "Bearer "
    const hash = hashApiKey(key);

    try {
      const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash: hash },
        include: {
          user: {
            select: { id: true, email: true, name: true, role: true, isActive: true },
          },
        },
      });

      if (!apiKey) {
        reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid API key',
          },
        });
        return;
      }

      // Check expiration
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        reply.status(401).send({
          success: false,
          error: {
            code: 'API_KEY_EXPIRED',
            message: 'API key has expired',
          },
        });
        return;
      }

      if (!apiKey.user.isActive) {
        reply.status(403).send({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Account is disabled',
          },
        });
        return;
      }

      // Update last used (non-blocking)
      prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {});

      // Set user on request
      (request as FastifyRequest & { user: { id: string; email: string; name: string | null; role: 'ADMIN' | 'USER'; isActive: boolean } }).user = {
        id: apiKey.user.id,
        email: apiKey.user.email,
        name: apiKey.user.name ?? 'Unknown',
        role: apiKey.user.role,
        isActive: apiKey.user.isActive,
      };

      logger.debug({ userId: apiKey.user.id, keyId: apiKey.id }, 'API key authenticated');
    } catch (error) {
      logger.error({ error }, 'API key authentication error');
      reply.status(500).send({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication failed',
        },
      });
    }
  }
  // If not an API key, let JWT handler process it
}

// ===========================================
// VALIDATION ERROR HANDLER
// ===========================================

/**
 * Format Zod validation errors for API response
 */
export function formatValidationError(error: ZodError): { field: string; message: string }[] {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Validation error response
 */
export function validationErrorResponse(error: ZodError) {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: formatValidationError(error),
    },
  };
}

// ===========================================
// COMMON VALIDATION SCHEMAS
// ===========================================

export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid(),
  
  // Pagination
  pagination: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
  
  // Name (for projects, teams, etc.)
  name: z.string().min(1).max(100).transform(sanitizeString),
  
  // Description
  description: z.string().max(1000).optional().transform((v) => v ? sanitizeString(v) : v),
  
  // URL
  url: z.string().url().transform((v) => sanitizeUrl(v) || v),
  
  // Slug
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  
  // Email
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  
  // Git branch
  branch: z.string().min(1).max(256).regex(/^[a-zA-Z0-9._\/-]+$/, 'Invalid branch name'),
  
  // Environment variable key
  envKey: z.string().min(1).max(256).regex(/^[A-Z_][A-Z0-9_]*$/, 'Environment variable name must be uppercase with underscores'),
};

// ===========================================
// SECURITY HEADERS
// ===========================================

export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// ===========================================
// REQUEST LOGGING FOR AUDIT
// ===========================================

export interface RequestLogData {
  userId?: string;
  method: string;
  path: string;
  query?: unknown;
  ip?: string;
  userAgent?: string;
  duration?: number;
  statusCode?: number;
}

/**
 * Log sensitive operations for audit trail
 */
export function logSensitiveOperation(data: RequestLogData): void {
  logger.info({
    ...data,
    timestamp: new Date().toISOString(),
  }, 'Sensitive operation');
}

// ===========================================
// IP EXTRACTION
// ===========================================

/**
 * Extract real client IP from request
 */
export function getClientIp(request: FastifyRequest): string {
  // Check X-Forwarded-For header (set by proxies/load balancers)
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Can be a comma-separated list, get the first one
    return forwardedFor.toString().split(',')[0].trim();
  }
  
  // Check X-Real-IP header (set by some proxies)
  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    return realIp.toString();
  }
  
  // Fall back to socket remote address
  return request.ip;
}

// ===========================================
// RATE LIMIT KEY GENERATORS
// ===========================================

export const rateLimitKeys = {
  // By IP
  byIp: (request: FastifyRequest) => getClientIp(request),
  
  // By user
  byUser: (request: FastifyRequest) => {
    const user = (request as FastifyRequest & { user?: { id?: string } }).user;
    return user?.id || getClientIp(request);
  },
  
  // By API key
  byApiKey: (request: FastifyRequest) => {
    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer zk_')) {
      // Use first 20 chars of API key as identifier
      return auth.substring(7, 27);
    }
    return getClientIp(request);
  },
};
