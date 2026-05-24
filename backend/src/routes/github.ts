// ===========================================
// GITHUB INTEGRATION ROUTES
// Handles GitHub repository listing and webhooks
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { getGitHubToken } from '@/lib/github-token.js';

const logger = createLogger('github');

// ===========================================
// TYPES
// ===========================================

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  updated_at: string;
  pushed_at: string;
  language: string | null;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
}

interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

// ===========================================
// ROUTES
// ===========================================

export async function githubRoutes(app: FastifyInstance): Promise<void> {
  // Get connected GitHub account info
  app.get('/account', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        githubId: true,
        avatarUrl: true,
        name: true,
      },
    });

    if (!user?.githubId) {
      return reply.send({
        success: true,
        data: {
          connected: false,
          username: null,
          avatarUrl: null,
          name: null,
          profileUrl: null,
        },
      });
    }

    // Get GitHub token from session/storage
    const githubToken = await getGitHubToken(userId);

    if (!githubToken) {
      return reply.send({
        success: true,
        data: {
          connected: false,
          username: null,
          avatarUrl: null,
          name: null,
          profileUrl: null,
        },
      });
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return reply.send({
          success: true,
          data: {
            connected: false,
            username: null,
            avatarUrl: null,
            name: null,
            profileUrl: null,
          },
        });
      }

      const githubUser = await response.json();

      return reply.send({
        success: true,
        data: {
          connected: true,
          username: githubUser.login,
          avatarUrl: githubUser.avatar_url,
          name: githubUser.name,
          profileUrl: githubUser.html_url,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch GitHub account');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'GITHUB_API_ERROR',
          message: 'Failed to fetch GitHub account info',
        },
      });
    }
  });

  // List repositories from connected GitHub account
  app.get('/repos', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const query = request.query as { page?: string; per_page?: string; sort?: string; type?: string };
    const { page = '1', per_page = '30', sort = 'pushed', type = 'all' } = query;

    const githubToken = await getGitHubToken(userId);

    if (!githubToken) {
      return reply.send({
        success: true,
        data: [],
        pagination: {
          page: parseInt(page),
          perPage: parseInt(per_page),
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }

    try {
      // Fetch repositories
      const response = await fetch(
        `https://api.github.com/user/repos?page=${page}&per_page=${per_page}&sort=${sort}&type=${type}&affiliation=owner,collaborator`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        logger.error({ error }, 'GitHub API error');
        return reply.status(response.status).send({
          success: false,
          error: {
            code: 'GITHUB_API_ERROR',
            message: error.message || 'Failed to fetch repositories',
          },
        });
      }

      const repos: GitHubRepo[] = await response.json();

      // Transform to our format
      const repositories = repos.map((repo) => ({
        id: String(repo.id),
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        url: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        defaultBranch: repo.default_branch,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at,
        language: repo.language,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
      }));

      // Get pagination info from headers
      const linkHeader = response.headers.get('Link') || '';
      const hasNextPage = linkHeader.includes('rel="next"');
      const hasPrevPage = linkHeader.includes('rel="prev"');

      return reply.send({
        success: true,
        data: repositories,
        pagination: {
          page: parseInt(page),
          perPage: parseInt(per_page),
          hasNextPage,
          hasPrevPage,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch repositories');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: 'Failed to fetch repositories',
        },
      });
    }
  });

  // Search repositories
  app.get('/repos/search', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const query = request.query as { q?: string; page?: string; per_page?: string };
    const { q, page = '1', per_page = '30' } = query;

    if (!q) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'MISSING_QUERY',
          message: 'Search query is required',
        },
      });
    }

    const githubToken = await getGitHubToken(userId);

    if (!githubToken) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'GITHUB_NOT_CONNECTED',
          message: 'GitHub account not connected or token expired',
        },
      });
    }

    try {
      // Get user's GitHub username first
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      const githubUser = await userResponse.json();

      // Search in user's repos
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}+user:${githubUser.login}&page=${page}&per_page=${per_page}`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return reply.status(response.status).send({
          success: false,
          error: {
            code: 'GITHUB_API_ERROR',
            message: error.message || 'Search failed',
          },
        });
      }

      const data = await response.json();
      const repos: GitHubRepo[] = data.items;

      const repositories = repos.map((repo) => ({
        id: String(repo.id),
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        url: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        defaultBranch: repo.default_branch,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at,
        language: repo.language,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
      }));

      return reply.send({
        success: true,
        data: repositories,
        pagination: {
          page: parseInt(page),
          perPage: parseInt(per_page),
          total: data.total_count,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to search repositories');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'SEARCH_ERROR',
          message: 'Failed to search repositories',
        },
      });
    }
  });

  // Get repository branches
  app.get('/repos/:owner/:repo/branches', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const params = request.params as { owner: string; repo: string };
    const { owner, repo } = params;

    const githubToken = await getGitHubToken(userId);

    if (!githubToken) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'GITHUB_NOT_CONNECTED',
          message: 'GitHub account not connected or token expired',
        },
      });
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return reply.status(response.status).send({
          success: false,
          error: {
            code: 'GITHUB_API_ERROR',
            message: error.message || 'Failed to fetch branches',
          },
        });
      }

      const branches: GitHubBranch[] = await response.json();

      return reply.send({
        success: true,
        data: branches.map((branch) => ({
          name: branch.name,
          sha: branch.commit.sha,
          protected: branch.protected,
        })),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch branches');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: 'Failed to fetch branches',
        },
      });
    }
  });

  // Get repository details with detection
  app.get('/repos/:owner/:repo/analyze', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const params = request.params as { owner: string; repo: string };
    const query = request.query as { branch?: string };
    const { owner, repo } = params;
    const { branch } = query;

    const githubToken = await getGitHubToken(userId);

    if (!githubToken) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'GITHUB_NOT_CONNECTED',
          message: 'GitHub account not connected or token expired',
        },
      });
    }

    try {
      // Get repo info
      const repoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (!repoResponse.ok) {
        return reply.status(repoResponse.status).send({
          success: false,
          error: {
            code: 'REPO_NOT_FOUND',
            message: 'Repository not found or access denied',
          },
        });
      }

      const repoData: GitHubRepo = await repoResponse.json();
      const targetBranch = branch || repoData.default_branch;

      // Get root directory contents to detect framework
      const contentsResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents?ref=${targetBranch}`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      let detection = {
        framework: 'unknown',
        language: repoData.language?.toLowerCase() || 'unknown',
        buildCommand: null as string | null,
        installCommand: null as string | null,
        startCommand: null as string | null,
        outputDirectory: null as string | null,
        port: 3000,
      };

      if (contentsResponse.ok) {
        const contents = await contentsResponse.json() as { name: string; type: string }[];
        const fileNames = contents.filter((c) => c.type === 'file').map((c) => c.name);

        // Detect framework based on files
        detection = detectFramework(fileNames, repoData.language);

        // Try to get package.json for more details
        if (fileNames.includes('package.json')) {
          const packageJsonResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/package.json?ref=${targetBranch}`,
            {
              headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
              },
            }
          );

          if (packageJsonResponse.ok) {
            const packageJsonData = await packageJsonResponse.json() as { content: string };
            const packageJson = JSON.parse(Buffer.from(packageJsonData.content, 'base64').toString());
            detection = enhanceDetectionFromPackageJson(detection, packageJson);
          }
        }
      }

      return reply.send({
        success: true,
        data: {
          repository: {
            id: String(repoData.id),
            name: repoData.name,
            fullName: repoData.full_name,
            private: repoData.private,
            url: repoData.html_url,
            cloneUrl: repoData.clone_url,
            defaultBranch: repoData.default_branch,
            language: repoData.language,
            description: repoData.description,
          },
          detection,
          suggestedConfig: {
            name: repoData.name.split('-').map((word: string) => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' '),
            slug: repoData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            branch: targetBranch,
            rootDirectory: './',
            ...detection,
          },
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze repository');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'ANALYZE_ERROR',
          message: 'Failed to analyze repository',
        },
      });
    }
  });
}

function detectFramework(files: string[], language: string | null): {
  framework: string;
  language: string;
  buildCommand: string | null;
  installCommand: string | null;
  startCommand: string | null;
  outputDirectory: string | null;
  port: number;
} {
  // Default detection
  const detection = {
    framework: 'unknown',
    language: language?.toLowerCase() || 'unknown',
    buildCommand: null as string | null,
    installCommand: null as string | null,
    startCommand: null as string | null,
    outputDirectory: null as string | null,
    port: 3000,
  };

  // Next.js
  if (files.includes('next.config.js') || files.includes('next.config.mjs') || files.includes('next.config.ts')) {
    detection.framework = 'nextjs';
    detection.language = 'typescript';
    detection.buildCommand = 'npm run build';
    detection.installCommand = 'npm install';
    detection.startCommand = 'npm start';
    detection.outputDirectory = '.next';
    detection.port = 3000;
    return detection;
  }

  // Nuxt
  if (files.includes('nuxt.config.js') || files.includes('nuxt.config.ts')) {
    detection.framework = 'nuxt';
    detection.language = 'typescript';
    detection.buildCommand = 'npm run build';
    detection.installCommand = 'npm install';
    detection.startCommand = 'npm start';
    detection.outputDirectory = '.nuxt';
    detection.port = 3000;
    return detection;
  }

  // Vite / React / Vue
  if (files.includes('vite.config.js') || files.includes('vite.config.ts')) {
    detection.framework = 'vite';
    detection.language = 'typescript';
    detection.buildCommand = 'npm run build';
    detection.installCommand = 'npm install';
    detection.outputDirectory = 'dist';
    detection.port = 5173;
    return detection;
  }

  // SvelteKit
  if (files.includes('svelte.config.js')) {
    detection.framework = 'sveltekit';
    detection.language = 'typescript';
    detection.buildCommand = 'npm run build';
    detection.installCommand = 'npm install';
    detection.outputDirectory = 'build';
    detection.port = 3000;
    return detection;
  }

  // Astro
  if (files.includes('astro.config.mjs') || files.includes('astro.config.js')) {
    detection.framework = 'astro';
    detection.language = 'typescript';
    detection.buildCommand = 'npm run build';
    detection.installCommand = 'npm install';
    detection.outputDirectory = 'dist';
    detection.port = 4321;
    return detection;
  }

  // Remix
  if (files.includes('remix.config.js')) {
    detection.framework = 'remix';
    detection.language = 'typescript';
    detection.buildCommand = 'npm run build';
    detection.installCommand = 'npm install';
    detection.startCommand = 'npm start';
    detection.outputDirectory = 'build';
    detection.port = 3000;
    return detection;
  }

  // Express/Node.js
  if (files.includes('package.json') && language === 'JavaScript') {
    detection.framework = 'express';
    detection.language = 'javascript';
    detection.installCommand = 'npm install';
    detection.startCommand = 'npm start';
    detection.port = 3000;
    return detection;
  }

  // Python - Django
  if (files.includes('manage.py')) {
    detection.framework = 'django';
    detection.language = 'python';
    detection.installCommand = 'pip install -r requirements.txt';
    detection.startCommand = 'python manage.py runserver 0.0.0.0:8000';
    detection.port = 8000;
    return detection;
  }

  // Python - Flask/FastAPI
  if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
    detection.framework = 'python';
    detection.language = 'python';
    detection.installCommand = 'pip install -r requirements.txt';
    detection.port = 8000;
    return detection;
  }

  // Go
  if (files.includes('go.mod')) {
    detection.framework = 'go';
    detection.language = 'go';
    detection.buildCommand = 'go build -o app';
    detection.startCommand = './app';
    detection.port = 8080;
    return detection;
  }

  // Rust
  if (files.includes('Cargo.toml')) {
    detection.framework = 'rust';
    detection.language = 'rust';
    detection.buildCommand = 'cargo build --release';
    detection.startCommand = './target/release/app';
    detection.port = 8080;
    return detection;
  }

  // Docker
  if (files.includes('Dockerfile') || files.includes('docker-compose.yml')) {
    detection.framework = 'docker';
    return detection;
  }

  // Static site
  if (files.includes('index.html')) {
    detection.framework = 'static';
    detection.language = 'html';
    detection.outputDirectory = './';
    detection.port = 80;
    return detection;
  }

  return detection;
}

function enhanceDetectionFromPackageJson(
  detection: ReturnType<typeof detectFramework>,
  packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  }
): ReturnType<typeof detectFramework> {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const scripts = packageJson.scripts || {};

  // Detect framework from dependencies
  if (deps['next']) {
    detection.framework = 'nextjs';
  } else if (deps['nuxt']) {
    detection.framework = 'nuxt';
  } else if (deps['@sveltejs/kit']) {
    detection.framework = 'sveltekit';
  } else if (deps['astro']) {
    detection.framework = 'astro';
  } else if (deps['@remix-run/react']) {
    detection.framework = 'remix';
  } else if (deps['react']) {
    detection.framework = deps['vite'] ? 'vite-react' : 'react';
  } else if (deps['vue']) {
    detection.framework = deps['vite'] ? 'vite-vue' : 'vue';
  } else if (deps['svelte']) {
    detection.framework = 'svelte';
  } else if (deps['express']) {
    detection.framework = 'express';
  } else if (deps['fastify']) {
    detection.framework = 'fastify';
  } else if (deps['@nestjs/core']) {
    detection.framework = 'nestjs';
  }

  // Check for TypeScript
  if (deps['typescript']) {
    detection.language = 'typescript';
  }

  // Get commands from scripts
  if (scripts.build) {
    detection.buildCommand = 'npm run build';
  }
  if (scripts.start) {
    detection.startCommand = 'npm start';
  }
  if (scripts.dev) {
    detection.startCommand = detection.startCommand || 'npm run dev';
  }

  return detection;
}
