// ===========================================
// AUTHENTICATION ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { config } from '@/config/index.js';
import { storeGitHubToken } from './github.js';

const logger = createLogger('auth');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
});

const githubCallbackSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});

// ===========================================
// ROUTES
// ===========================================

export async function authRoutes(app: FastifyInstance): Promise<void> {
  
  // ===========================================
  // EMAIL/PASSWORD AUTHENTICATION
  // ===========================================
  
  // Register new user
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = registerSchema.safeParse(request.body);
    
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

    const { email, name, password } = parseResult.data;

    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: 'A user with this email already exists',
          },
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          lastLoginAt: new Date(),
        },
      });

      // Generate JWT
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
      });

      logger.info({ userId: user.id, email }, 'New user registered');

      return reply.status(201).send({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
        },
      });
    } catch (error) {
      logger.error({ error }, 'Registration error');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'REGISTRATION_ERROR',
          message: 'Failed to register user',
        },
      });
    }
  });

  // Login with email/password
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = loginSchema.safeParse(request.body);
    
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

    const { email, password } = parseResult.data;

    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.password) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate JWT
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
      });

      logger.info({ userId: user.id, email }, 'User logged in');

      return reply.send({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
        },
      });
    } catch (error) {
      logger.error({ error }, 'Login error');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'LOGIN_ERROR',
          message: 'Failed to login',
        },
      });
    }
  });

  // ===========================================
  // GITHUB OAUTH
  // ===========================================
  
  // GitHub OAuth initiation
  app.get('/github', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!config.github.clientId) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'GITHUB_NOT_CONFIGURED',
          message: 'GitHub OAuth is not configured',
        },
      });
    }

    const state = crypto.randomUUID();
    const redirectUrl = new URL('https://github.com/login/oauth/authorize');
    redirectUrl.searchParams.set('client_id', config.github.clientId);
    redirectUrl.searchParams.set('redirect_uri', config.github.callbackUrl || '');
    redirectUrl.searchParams.set('scope', 'user:email read:user repo');
    redirectUrl.searchParams.set('state', state);

    return reply.send({
      success: true,
      data: {
        redirectUrl: redirectUrl.toString(),
        state,
      },
    });
  });

  // GitHub OAuth callback
  app.post('/github/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = githubCallbackSchema.safeParse(request.body);
    
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

    const { code } = parseResult.data;

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: config.github.clientId,
          client_secret: config.github.clientSecret,
          code,
        }),
      });

      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };

      if (tokenData.error || !tokenData.access_token) {
        logger.error({ error: tokenData.error }, 'GitHub token exchange failed');
        return reply.status(400).send({
          success: false,
          error: {
            code: 'GITHUB_AUTH_FAILED',
            message: 'Failed to authenticate with GitHub',
          },
        });
      }

      // Get user info from GitHub
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      const githubUser = await userResponse.json() as {
        id: number;
        login: string;
        email: string | null;
        name: string | null;
        avatar_url: string;
      };

      // Get user email if not public
      let email = githubUser.email;
      if (!email) {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        });
        const emails = await emailsResponse.json() as { email: string; primary: boolean }[];
        const primaryEmail = emails.find(e => e.primary);
        email = primaryEmail?.email || emails[0]?.email;
      }

      if (!email) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'NO_EMAIL',
            message: 'Could not retrieve email from GitHub account',
          },
        });
      }

      // Find or create user
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { githubId: String(githubUser.id) },
            { email },
          ],
        },
      });

      if (user) {
        // Update existing user
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            githubId: String(githubUser.id),
            avatarUrl: githubUser.avatar_url,
            lastLoginAt: new Date(),
          },
        });
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            email,
            name: githubUser.name || githubUser.login,
            githubId: String(githubUser.id),
            avatarUrl: githubUser.avatar_url,
            lastLoginAt: new Date(),
          },
        });
      }

      // Generate JWT
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
      });

      // Store GitHub access token for repo access
      await storeGitHubToken(user.id, tokenData.access_token);

      logger.info({ userId: user.id }, 'User authenticated via GitHub');

      return reply.send({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
        },
      });
    } catch (error) {
      logger.error({ error }, 'GitHub authentication error');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication failed',
        },
      });
    }
  });

  // Get current user
  app.get('/me', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            projects: true,
            teamMembers: true,
          },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        user: {
          ...user,
          projectCount: user._count.projects,
          teamCount: user._count.teamMembers,
        },
      },
    });
  });

  // Refresh token
  app.post('/refresh', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const email = request.user?.email as string;

    const token = app.jwt.sign({
      sub: userId,
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
    });

    return reply.send({
      success: true,
      data: { token },
    });
  });

  // Logout (invalidate token - handled client-side mostly)
  app.post('/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    // In a production system, you'd add the token to a blacklist in Redis
    return reply.send({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  });
}
