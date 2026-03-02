// ===========================================
// AI ROUTES
// AI-powered analysis and recommendations endpoints
// ===========================================

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { aiEngine } from '../services/ai/index.js';
import { createLogger } from '../lib/logger.js';
import { getGitHubToken } from '../lib/github-token.js';

const logger = createLogger('ai-routes');

// ===========================================
// SCHEMAS
// ===========================================

const analyzeProjectSchema = z.object({
  packageJson: z.record(z.unknown()).optional(),
  files: z.array(z.string()),
  languages: z.record(z.number()).optional(),
  dependencies: z.record(z.string()).optional(),
  devDependencies: z.record(z.string()).optional(),
  hasDockerfile: z.boolean().optional(),
  hasTests: z.boolean().optional(),
  repoSize: z.number().optional(),
});

const analyzeRepoSchema = z.object({
  repoUrl: z.string().url(),
  branch: z.string().optional(),
});

const generateDockerfileSchema = z.object({
  framework: z.string(),
  language: z.string().optional(),
  packageManager: z.string().optional(),
  buildCommand: z.string().optional(),
  startCommand: z.string().optional(),
  port: z.number().optional(),
  nodeVersion: z.string().optional(),
});

// ===========================================
// ROUTES
// ===========================================

export async function aiRoutes(app: FastifyInstance) {
  // ===========================================
  // POST /api/v1/ai/analyze - Analyze project from data
  // ===========================================
  app.post('/analyze', async (request, reply) => {
    try {
      const body = analyzeProjectSchema.parse(request.body);
      
      const result = await aiEngine.analyzeProject({
        packageJson: body.packageJson,
        files: body.files,
        languages: body.languages || {},
        dependencies: body.dependencies || {},
        devDependencies: body.devDependencies || {},
        hasDockerfile: body.hasDockerfile || false,
        hasTests: body.hasTests || false,
        repoSize: body.repoSize || 0,
      });

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze project');
      return reply.status(400).send({
        success: false,
        message: error instanceof Error ? error.message : 'Analysis failed',
      });
    }
  });

  // ===========================================
  // POST /api/v1/ai/analyze-repo - Analyze from GitHub repo
  // ===========================================
  app.post('/analyze-repo', async (request, reply) => {
    try {
      const body = analyzeRepoSchema.parse(request.body);
      const user = (request as { user?: { id: string } }).user;
      
      if (!user) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required',
        });
      }

      // Parse repo URL
      const match = body.repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid GitHub repository URL',
        });
      }

      const [, owner, repo] = match;
      const repoName = repo.replace('.git', '');

      // Fetch repo data from GitHub
      const githubToken = await getGitHubToken(user.id);

      if (!githubToken) {
        return reply.status(400).send({
          success: false,
          message: 'GitHub not connected. Please connect your GitHub account first.',
        });
      }

      // Fetch repository contents
      const headers = {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Zyphron-Deploy',
      };

      // Get repo info
      const repoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}`,
        { headers }
      );

      if (!repoResponse.ok) {
        throw new Error('Failed to fetch repository');
      }

      const repoData = await repoResponse.json() as { size: number; default_branch: string };

      // Get repository tree
      const branch = body.branch || repoData.default_branch;
      const treeResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/git/trees/${branch}?recursive=1`,
        { headers }
      );

      if (!treeResponse.ok) {
        throw new Error('Failed to fetch repository tree');
      }

      const treeData = await treeResponse.json() as { 
        tree: Array<{ path: string; type: string }> 
      };
      const files = treeData.tree
        .filter((item) => item.type === 'blob')
        .map((item) => item.path);

      // Try to fetch package.json
      let packageJson: Record<string, unknown> | undefined;
      let dependencies: Record<string, string> = {};
      let devDependencies: Record<string, string> = {};

      if (files.includes('package.json')) {
        const pkgResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/contents/package.json?ref=${branch}`,
          { headers }
        );

        if (pkgResponse.ok) {
          const pkgData = await pkgResponse.json() as { content: string };
          const content = Buffer.from(pkgData.content, 'base64').toString('utf-8');
          packageJson = JSON.parse(content);
          dependencies = (packageJson?.dependencies as Record<string, string>) || {};
          devDependencies = (packageJson?.devDependencies as Record<string, string>) || {};
        }
      }

      // Try to fetch requirements.txt for Python projects
      if (files.includes('requirements.txt')) {
        const reqResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/contents/requirements.txt?ref=${branch}`,
          { headers }
        );

        if (reqResponse.ok) {
          const reqData = await reqResponse.json() as { content: string };
          const content = Buffer.from(reqData.content, 'base64').toString('utf-8');
          const lines = content.split('\n').filter(Boolean);
          for (const line of lines) {
            const match = line.match(/^([a-zA-Z0-9_-]+)/);
            if (match) {
              dependencies[match[1]] = '*';
            }
          }
        }
      }

      // Analyze language distribution
      const languages: Record<string, number> = {};
      const extensions: Record<string, string> = {
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.py': 'python',
        '.go': 'go',
        '.rs': 'rust',
        '.rb': 'ruby',
        '.java': 'java',
        '.php': 'php',
      };

      for (const file of files) {
        for (const [ext, lang] of Object.entries(extensions)) {
          if (file.endsWith(ext)) {
            languages[lang] = (languages[lang] || 0) + 1;
          }
        }
      }

      // Run AI analysis
      const result = await aiEngine.analyzeProject({
        packageJson,
        files,
        languages,
        dependencies,
        devDependencies,
        hasDockerfile: files.includes('Dockerfile'),
        hasTests: files.some(f => 
          f.includes('test') || 
          f.includes('spec') || 
          f.includes('__tests__')
        ),
        repoSize: repoData.size * 1024, // GitHub reports in KB
      });

      return reply.send({
        success: true,
        data: {
          ...result,
          repository: {
            owner,
            name: repoName,
            branch,
            url: body.repoUrl,
          },
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze repository');
      return reply.status(400).send({
        success: false,
        message: error instanceof Error ? error.message : 'Repository analysis failed',
      });
    }
  });

  // ===========================================
  // GET /api/v1/ai/frameworks - List supported frameworks
  // ===========================================
  app.get('/frameworks', async (_request, reply) => {
    const frameworks = [
      { name: 'nextjs', label: 'Next.js', language: 'JavaScript/TypeScript', type: 'fullstack' },
      { name: 'react', label: 'React', language: 'JavaScript/TypeScript', type: 'frontend' },
      { name: 'vue', label: 'Vue.js', language: 'JavaScript/TypeScript', type: 'frontend' },
      { name: 'nuxt', label: 'Nuxt', language: 'JavaScript/TypeScript', type: 'fullstack' },
      { name: 'svelte', label: 'Svelte/SvelteKit', language: 'JavaScript/TypeScript', type: 'frontend' },
      { name: 'angular', label: 'Angular', language: 'TypeScript', type: 'frontend' },
      { name: 'express', label: 'Express', language: 'JavaScript/TypeScript', type: 'backend' },
      { name: 'fastify', label: 'Fastify', language: 'JavaScript/TypeScript', type: 'backend' },
      { name: 'nestjs', label: 'NestJS', language: 'TypeScript', type: 'backend' },
      { name: 'django', label: 'Django', language: 'Python', type: 'fullstack' },
      { name: 'fastapi', label: 'FastAPI', language: 'Python', type: 'backend' },
      { name: 'flask', label: 'Flask', language: 'Python', type: 'backend' },
      { name: 'rails', label: 'Ruby on Rails', language: 'Ruby', type: 'fullstack' },
      { name: 'go', label: 'Go', language: 'Go', type: 'backend' },
      { name: 'rust', label: 'Rust', language: 'Rust', type: 'backend' },
      { name: 'static', label: 'Static Site', language: 'HTML/CSS/JS', type: 'static' },
      { name: 'docker', label: 'Docker', language: 'Any', type: 'container' },
    ];

    return reply.send({
      success: true,
      data: frameworks,
    });
  });

  // ===========================================
  // POST /api/v1/ai/suggest-resources - Get resource recommendations
  // ===========================================
  app.post('/suggest-resources', async (request, reply) => {
    try {
      const body = z.object({
        framework: z.string(),
        expectedTraffic: z.enum(['low', 'medium', 'high']).optional(),
        hasDatabase: z.boolean().optional(),
        region: z.string().optional(),
      }).parse(request.body);

      // Base resources by framework
      const baseResources: Record<string, { cpu: string; memory: string; cost: number }> = {
        nextjs: { cpu: '0.5', memory: '512Mi', cost: 15 },
        react: { cpu: '0.25', memory: '256Mi', cost: 5 },
        vue: { cpu: '0.25', memory: '256Mi', cost: 5 },
        express: { cpu: '0.25', memory: '256Mi', cost: 5 },
        fastify: { cpu: '0.25', memory: '256Mi', cost: 5 },
        nestjs: { cpu: '0.5', memory: '512Mi', cost: 15 },
        django: { cpu: '0.5', memory: '512Mi', cost: 15 },
        fastapi: { cpu: '0.25', memory: '256Mi', cost: 5 },
        rails: { cpu: '1', memory: '1Gi', cost: 40 },
        go: { cpu: '0.25', memory: '128Mi', cost: 3 },
        rust: { cpu: '0.25', memory: '128Mi', cost: 3 },
      };

      const base = baseResources[body.framework] || baseResources.express;

      // Adjust for traffic
      const trafficMultiplier = {
        low: 1,
        medium: 2,
        high: 4,
      }[body.expectedTraffic || 'low'];

      const cpuValue = parseFloat(base.cpu) * trafficMultiplier;
      const memoryValue = parseInt(base.memory) * trafficMultiplier;

      const result = {
        recommended: {
          cpu: `${cpuValue}`,
          memory: memoryValue >= 1024 ? `${memoryValue / 1024}Gi` : `${memoryValue}Mi`,
          instances: body.expectedTraffic === 'high' ? 3 : body.expectedTraffic === 'medium' ? 2 : 1,
        },
        scaling: {
          enabled: body.expectedTraffic !== 'low',
          minInstances: 1,
          maxInstances: body.expectedTraffic === 'high' ? 10 : 5,
          targetCpuUtilization: 70,
        },
        estimatedCost: {
          monthly: Math.round(base.cost * trafficMultiplier),
          database: body.hasDatabase ? 20 : 0,
        },
        suggestions: [] as string[],
      };

      if (body.expectedTraffic === 'high') {
        result.suggestions.push('Consider enabling CDN for static assets');
        result.suggestions.push('Enable Redis caching for improved performance');
      }

      if (body.hasDatabase) {
        result.suggestions.push('Use connection pooling for database connections');
      }

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to suggest resources',
      });
    }
  });

  // ===========================================
  // POST /api/v1/ai/generate-dockerfile - Generate optimized Dockerfile
  // ===========================================
  app.post('/generate-dockerfile', async (request, reply) => {
    try {
      const body = generateDockerfileSchema.parse(request.body);

      const { dockerfileGenerator } = await import('../services/builder/dockerfile-generator.js');

      const detection = {
        framework: body.framework as import('../services/detector/index.js').FrameworkType,
        language: (body.language || 'javascript') as import('../services/detector/index.js').Language,
        packageManager: (body.packageManager || 'npm') as import('../services/detector/index.js').PackageManager,
        projectType: 'fullstack' as import('../services/detector/index.js').ProjectType,
        buildCommand: body.buildCommand || null,
        installCommand: body.packageManager === 'yarn' ? 'yarn install --frozen-lockfile' :
                        body.packageManager === 'pnpm' ? 'pnpm install --frozen-lockfile' :
                        'npm ci',
        startCommand: body.startCommand || null,
        outputDirectory: null,
        nodeVersion: body.nodeVersion || '20',
        port: body.port || 3000,
        env: {},
        dockerfileExists: false,
        confidence: 100,
      };

      const result = dockerfileGenerator.generate(detection);

      return reply.send({
        success: true,
        data: {
          dockerfile: result.dockerfile,
          dockerignore: result.dockerignore,
          optimizations: result.optimizations,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate Dockerfile');
      return reply.status(400).send({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate Dockerfile',
      });
    }
  });

  // Compatibility alias used by older clients/scripts
  app.post('/dockerfile', async (request, reply) => {
    try {
      const body = z.object({
        framework: z.string().optional(),
        language: z.string().optional(),
        packageManager: z.string().optional(),
        buildCommand: z.string().optional(),
        startCommand: z.string().optional(),
        port: z.number().optional(),
        nodeVersion: z.string().optional(),
        repoUrl: z.string().url().optional(),
      }).parse(request.body);

      const fallbackFramework = (() => {
        if (!body.repoUrl) return 'node';
        if (body.repoUrl.includes('next')) return 'nextjs';
        if (body.repoUrl.includes('django')) return 'django';
        if (body.repoUrl.includes('fastapi')) return 'fastapi';
        return 'node';
      })();

      const normalized = generateDockerfileSchema.parse({
        framework: body.framework || fallbackFramework,
        language: body.language,
        packageManager: body.packageManager,
        buildCommand: body.buildCommand,
        startCommand: body.startCommand,
        port: body.port,
        nodeVersion: body.nodeVersion,
      });

      const { dockerfileGenerator } = await import('../services/builder/dockerfile-generator.js');
      const detection = {
        framework: normalized.framework as import('../services/detector/index.js').FrameworkType,
        language: (normalized.language || 'javascript') as import('../services/detector/index.js').Language,
        packageManager: (normalized.packageManager || 'npm') as import('../services/detector/index.js').PackageManager,
        projectType: 'fullstack' as import('../services/detector/index.js').ProjectType,
        buildCommand: normalized.buildCommand || null,
        installCommand: normalized.packageManager === 'yarn' ? 'yarn install --frozen-lockfile' :
                        normalized.packageManager === 'pnpm' ? 'pnpm install --frozen-lockfile' :
                        'npm ci',
        startCommand: normalized.startCommand || null,
        outputDirectory: null,
        nodeVersion: normalized.nodeVersion || '20',
        port: normalized.port || 3000,
        env: {},
        dockerfileExists: false,
        confidence: 100,
      };
      const result = dockerfileGenerator.generate(detection);

      return reply.send({
        success: true,
        data: {
          dockerfile: result.dockerfile,
          dockerignore: result.dockerignore,
          optimizations: result.optimizations,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate Dockerfile (compat endpoint)');
      return reply.status(400).send({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate Dockerfile',
      });
    }
  });
}
