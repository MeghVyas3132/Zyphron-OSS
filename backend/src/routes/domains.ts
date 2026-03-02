// ===========================================
// CUSTOM DOMAIN ROUTES
// Manages custom domain configuration for projects
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { getRedisClient } from '@/lib/redis.js';
import { projectWhereForUser } from '@/lib/project-access.js';
import crypto from 'crypto';

const logger = createLogger('domains');

// Get redis client
const redis = getRedisClient();

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const addDomainSchema = z.object({
  domain: z.string()
    .min(3)
    .max(253)
    .regex(/^(?!-)[A-Za-z0-9-]+([-.][A-Za-z0-9]+)*\.[A-Za-z]{2,}$/, 'Invalid domain format'),
});

// ===========================================
// TYPES
// ===========================================

interface DomainRecord {
  id: string;
  projectId: string;
  domain: string;
  verified: boolean;
  verificationToken: string;
  verificationMethod: 'dns_txt' | 'cname';
  sslStatus: 'pending' | 'provisioning' | 'active' | 'failed';
  createdAt: Date;
  verifiedAt: Date | null;
}

// ===========================================
// ROUTES
// ===========================================

export async function domainRoutes(app: FastifyInstance): Promise<void> {
  // List domains for a project
  app.get('/projects/:projectId/domains', {
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

    // Get domains from Redis (in production, use DB)
    const domainsKey = `project:${project.id}:domains`;
    const domainsJson = await redis.hgetall(domainsKey);
    
    const domains: DomainRecord[] = Object.values(domainsJson).map(d => JSON.parse(d as string));

    return reply.send({
      success: true,
      data: {
        domains,
        primaryDomain: project.customDomain,
        subdomain: `${project.subdomain}.${process.env.BASE_DOMAIN || 'localhost'}`,
      },
    });
  });

  // Add custom domain
  app.post('/projects/:projectId/domains', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;

    const parseResult = addDomainSchema.safeParse(request.body);
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

    const { domain } = parseResult.data;

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

    // Check if domain already exists
    const existingProject = await prisma.project.findFirst({
      where: { customDomain: domain },
    });

    if (existingProject) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'DOMAIN_IN_USE',
          message: 'This domain is already in use by another project',
        },
      });
    }

    // Generate verification token
    const verificationToken = `zyphron-verify-${crypto.randomBytes(16).toString('hex')}`;
    
    const domainRecord: DomainRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      domain,
      verified: false,
      verificationToken,
      verificationMethod: 'dns_txt',
      sslStatus: 'pending',
      createdAt: new Date(),
      verifiedAt: null,
    };

    // Store in Redis
    const domainsKey = `project:${project.id}:domains`;
    await redis.hset(domainsKey, domain, JSON.stringify(domainRecord));

    logger.info({ projectId: project.id, domain, userId }, 'Custom domain added');

    return reply.status(201).send({
      success: true,
      data: {
        domain: domainRecord,
        verification: {
          method: 'dns_txt',
          recordType: 'TXT',
          hostname: `_zyphron.${domain}`,
          value: verificationToken,
          instructions: [
            `Add a TXT record to your DNS configuration:`,
            `Host/Name: _zyphron`,
            `Value: ${verificationToken}`,
            `Then click "Verify" to complete the setup.`,
          ],
          alternativeCname: {
            recordType: 'CNAME',
            hostname: domain,
            value: `${project.subdomain}.${process.env.BASE_DOMAIN || 'localhost'}`,
          },
        },
      },
    });
  });

  // Verify domain
  app.post('/projects/:projectId/domains/:domain/verify', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; domain: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, domain } = request.params;

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

    // Get domain record
    const domainsKey = `project:${project.id}:domains`;
    const domainJson = await redis.hget(domainsKey, domain);

    if (!domainJson) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'DOMAIN_NOT_FOUND',
          message: 'Domain not found',
        },
      });
    }

    const domainRecord: DomainRecord = JSON.parse(domainJson);

    if (domainRecord.verified) {
      return reply.send({
        success: true,
        data: {
          domain: domainRecord,
          message: 'Domain is already verified',
        },
      });
    }

    // Verify DNS records
    const verificationResult = await verifyDomain(domain, domainRecord.verificationToken, project.subdomain);

    if (!verificationResult.verified) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VERIFICATION_FAILED',
          message: verificationResult.error || 'DNS verification failed',
          details: {
            expected: domainRecord.verificationToken,
            found: verificationResult.foundValue,
          },
        },
      });
    }

    // Update domain record
    domainRecord.verified = true;
    domainRecord.verifiedAt = new Date();
    domainRecord.sslStatus = 'provisioning';
    
    await redis.hset(domainsKey, domain, JSON.stringify(domainRecord));

    // Update project's custom domain
    await prisma.project.update({
      where: { id: project.id },
      data: { customDomain: domain },
    });

    // Trigger SSL provisioning (in production, integrate with Let's Encrypt)
    await triggerSslProvisioning(domain, project.subdomain);

    logger.info({ projectId: project.id, domain, userId }, 'Custom domain verified');

    return reply.send({
      success: true,
      data: {
        domain: domainRecord,
        message: 'Domain verified successfully. SSL certificate is being provisioned.',
      },
    });
  });

  // Remove domain
  app.delete('/projects/:projectId/domains/:domain', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; domain: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, domain } = request.params;

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

    // Remove from Redis
    const domainsKey = `project:${project.id}:domains`;
    await redis.hdel(domainsKey, domain);

    // Clear custom domain if it was the primary
    if (project.customDomain === domain) {
      await prisma.project.update({
        where: { id: project.id },
        data: { customDomain: null },
      });
    }

    logger.info({ projectId: project.id, domain, userId }, 'Custom domain removed');

    return reply.send({
      success: true,
      data: { message: 'Domain removed successfully' },
    });
  });

  // Get domain status
  app.get('/projects/:projectId/domains/:domain/status', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; domain: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, domain } = request.params;

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

    // Get domain record
    const domainsKey = `project:${project.id}:domains`;
    const domainJson = await redis.hget(domainsKey, domain);

    if (!domainJson) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'DOMAIN_NOT_FOUND',
          message: 'Domain not found',
        },
      });
    }

    const domainRecord: DomainRecord = JSON.parse(domainJson);

    // Check current DNS status
    const dnsStatus = await checkDnsStatus(domain, project.subdomain);

    return reply.send({
      success: true,
      data: {
        domain: domainRecord,
        dns: dnsStatus,
      },
    });
  });

  // Set primary domain
  app.post('/projects/:projectId/domains/:domain/primary', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; domain: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, domain } = request.params;

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

    // Get domain record
    const domainsKey = `project:${project.id}:domains`;
    const domainJson = await redis.hget(domainsKey, domain);

    if (!domainJson) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'DOMAIN_NOT_FOUND',
          message: 'Domain not found',
        },
      });
    }

    const domainRecord: DomainRecord = JSON.parse(domainJson);

    if (!domainRecord.verified) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'DOMAIN_NOT_VERIFIED',
          message: 'Domain must be verified before setting as primary',
        },
      });
    }

    // Update project's custom domain
    await prisma.project.update({
      where: { id: project.id },
      data: { customDomain: domain },
    });

    logger.info({ projectId: project.id, domain, userId }, 'Primary domain updated');

    return reply.send({
      success: true,
      data: { 
        message: 'Primary domain updated',
        primaryDomain: domain,
      },
    });
  });
}

// ===========================================
// DNS VERIFICATION HELPERS
// ===========================================

interface VerificationResult {
  verified: boolean;
  method: 'txt' | 'cname';
  foundValue?: string;
  error?: string;
}

async function verifyDomain(
  domain: string, 
  expectedToken: string,
  _targetSubdomain: string
): Promise<VerificationResult> {
  const dns = await import('dns').then(m => m.promises);

  try {
    // Try TXT record verification first
    const txtRecords = await dns.resolveTxt(`_zyphron.${domain}`);
    const flatRecords = txtRecords.flat();
    
    if (flatRecords.includes(expectedToken)) {
      return { verified: true, method: 'txt', foundValue: expectedToken };
    }

    return {
      verified: false,
      method: 'txt',
      foundValue: flatRecords[0] || 'No record found',
      error: 'TXT record value does not match',
    };
  } catch (error) {
    // TXT record not found, try CNAME
    try {
      const cnameRecords = await dns.resolveCname(domain);
      // For CNAME verification, we check if it points to our domain
      // In production, this would check against the actual target
      if (cnameRecords.length > 0) {
        return { 
          verified: true, 
          method: 'cname', 
          foundValue: cnameRecords[0],
        };
      }
    } catch {
      // CNAME also not found
    }

    return {
      verified: false,
      method: 'txt',
      error: 'No verification records found. Please add the TXT or CNAME record.',
    };
  }
}

interface DnsStatus {
  configured: boolean;
  type: 'A' | 'CNAME' | 'none';
  value?: string;
  propagated: boolean;
}

async function checkDnsStatus(domain: string, _subdomain: string): Promise<DnsStatus> {
  const dns = await import('dns').then(m => m.promises);

  try {
    // Check for CNAME
    const cnameRecords = await dns.resolveCname(domain);
    if (cnameRecords.length > 0) {
      return {
        configured: true,
        type: 'CNAME',
        value: cnameRecords[0],
        propagated: true,
      };
    }
  } catch {
    // No CNAME, try A record
  }

  try {
    // Check for A record
    const aRecords = await dns.resolve4(domain);
    if (aRecords.length > 0) {
      return {
        configured: true,
        type: 'A',
        value: aRecords[0],
        propagated: true,
      };
    }
  } catch {
    // No A record either
  }

  return {
    configured: false,
    type: 'none',
    propagated: false,
  };
}

async function triggerSslProvisioning(domain: string, subdomain: string): Promise<void> {
  // In production, this would:
  // 1. Request Let's Encrypt certificate via ACME
  // 2. Update Traefik/Nginx configuration
  // 3. Update domain SSL status in database

  logger.info({ domain, subdomain }, 'SSL provisioning triggered');

  // Simulate async SSL provisioning
  // In production, use a job queue
  const sslKey = `ssl:${domain}`;
  await redis.set(sslKey, JSON.stringify({
    domain,
    status: 'provisioning',
    startedAt: new Date().toISOString(),
  }));

  // Would trigger actual certificate generation here
  // e.g., await acmeClient.requestCertificate(domain);
}
