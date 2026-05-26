// ===========================================
// FRAMEWORK DETECTOR SERVICE
// Auto-detects project type, framework, and build configuration
// ===========================================

import { createLogger } from '../../lib/logger.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const logger = createLogger('detector');

// ===========================================
// TYPES
// ===========================================

export interface DetectionResult {
  framework: FrameworkType;
  language: Language;
  packageManager: PackageManager;
  projectType: ProjectType;
  buildCommand: string | null;
  installCommand: string;
  startCommand: string | null;
  outputDirectory: string | null;
  nodeVersion: string | null;
  port: number;
  env: Record<string, string>;
  dockerfileExists: boolean;
  confidence: number; // 0-100
  projectPath?: string; // populated by detectProject for use in Dockerfile generation
}

export type FrameworkType =
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'nuxt'
  | 'svelte'
  | 'sveltekit'
  | 'angular'
  | 'remix'
  | 'astro'
  | 'gatsby'
  | 'express'
  | 'fastify'
  | 'nestjs'
  | 'koa'
  | 'hono'
  | 'flask'
  | 'django'
  | 'fastapi'
  | 'streamlit'
  | 'gradio'
  | 'python'
  | 'rails'
  | 'laravel'
  | 'spring'
  | 'go'
  | 'rust'
  | 'static'
  | 'docker'
  | 'unknown';

export type Language = 'javascript' | 'typescript' | 'python' | 'ruby' | 'php' | 'go' | 'rust' | 'java' | 'unknown';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'poetry' | 'bundler' | 'composer' | 'cargo' | 'go' | 'maven' | 'gradle' | 'none';

export type ProjectType = 'static' | 'frontend' | 'backend' | 'fullstack' | 'unknown';

// ===========================================
// FRAMEWORK DETECTORS
// ===========================================

interface FrameworkDetector {
  name: FrameworkType;
  detect: (projectPath: string, packageJson?: PackageJson) => Promise<DetectionResult | null>;
  priority: number; // Higher = checked first
}

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
}

// ===========================================
// NEXT.JS DETECTOR
// ===========================================

const nextjsDetector: FrameworkDetector = {
  name: 'nextjs',
  priority: 100,
  detect: async (projectPath, packageJson) => {
    if (!packageJson) return null;

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (!deps['next']) return null;

    const hasAppDir = await fileExists(path.join(projectPath, 'app'));
    const hasSrcAppDir = await fileExists(path.join(projectPath, 'src', 'app'));
    // Used for future App Router vs Pages Router distinction
    void await fileExists(path.join(projectPath, 'pages'));
    void await fileExists(path.join(projectPath, 'src', 'pages'));

    // App Router detection (for future use)
    void (hasAppDir || hasSrcAppDir);
    const scripts = packageJson.scripts || {};

    return {
      framework: 'nextjs',
      language: deps['typescript'] ? 'typescript' : 'javascript',
      packageManager: await detectPackageManager(projectPath),
      projectType: 'fullstack',
      buildCommand: scripts.build || 'next build',
      installCommand: await getInstallCommand(projectPath),
      startCommand: scripts.start || 'next start',
      outputDirectory: '.next',
      nodeVersion: packageJson.engines?.node || '20',
      port: 3000,
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
      },
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 95,
    };
  },
};

// ===========================================
// REACT (CRA/VITE) DETECTOR
// ===========================================

const reactDetector: FrameworkDetector = {
  name: 'react',
  priority: 80,
  detect: async (projectPath, packageJson) => {
    if (!packageJson) return null;

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (!deps['react']) return null;
    if (deps['next']) return null; // Let Next.js detector handle it

    const scripts = packageJson.scripts || {};
    const isVite = !!deps['vite'];
    // Create React App detection (for future use)
    void !!deps['react-scripts'];

    let buildCommand = scripts.build || 'npm run build';
    let outputDirectory = 'build';

    if (isVite) {
      buildCommand = scripts.build || 'vite build';
      outputDirectory = 'dist';
    }

    return {
      framework: 'react',
      language: deps['typescript'] ? 'typescript' : 'javascript',
      packageManager: await detectPackageManager(projectPath),
      projectType: 'frontend',
      buildCommand,
      installCommand: await getInstallCommand(projectPath),
      startCommand: scripts.start || (isVite ? 'vite preview' : 'serve -s build'),
      outputDirectory,
      nodeVersion: packageJson.engines?.node || '20',
      port: 80, // React apps are served via nginx on port 80
      env: {},
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 85,
    };
  },
};

// ===========================================
// VUE DETECTOR
// ===========================================

const vueDetector: FrameworkDetector = {
  name: 'vue',
  priority: 80,
  detect: async (projectPath, packageJson) => {
    if (!packageJson) return null;

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (!deps['vue']) return null;
    if (deps['nuxt']) return null; // Let Nuxt detector handle it

    const scripts = packageJson.scripts || {};
    // Vite detection (for future build optimization)
    void !!deps['vite'];

    return {
      framework: 'vue',
      language: deps['typescript'] ? 'typescript' : 'javascript',
      packageManager: await detectPackageManager(projectPath),
      projectType: 'frontend',
      buildCommand: scripts.build || 'vite build',
      installCommand: await getInstallCommand(projectPath),
      startCommand: scripts.preview || 'vite preview',
      outputDirectory: 'dist',
      nodeVersion: packageJson.engines?.node || '20',
      port: 80, // Vue apps are served via nginx on port 80
      env: {},
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 85,
    };
  },
};

// ===========================================
// NUXT DETECTOR
// ===========================================

const nuxtDetector: FrameworkDetector = {
  name: 'nuxt',
  priority: 90,
  detect: async (projectPath, packageJson) => {
    if (!packageJson) return null;

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (!deps['nuxt']) return null;

    const scripts = packageJson.scripts || {};

    return {
      framework: 'nuxt',
      language: deps['typescript'] ? 'typescript' : 'javascript',
      packageManager: await detectPackageManager(projectPath),
      projectType: 'fullstack',
      buildCommand: scripts.build || 'nuxt build',
      installCommand: await getInstallCommand(projectPath),
      startCommand: scripts.start || 'node .output/server/index.mjs',
      outputDirectory: '.output',
      nodeVersion: packageJson.engines?.node || '20',
      port: 3000,
      env: {
        NUXT_TELEMETRY_DISABLED: '1',
      },
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 90,
    };
  },
};

// ===========================================
// SVELTE/SVELTEKIT DETECTOR
// ===========================================

const svelteDetector: FrameworkDetector = {
  name: 'svelte',
  priority: 80,
  detect: async (projectPath, packageJson) => {
    if (!packageJson) return null;

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (!deps['svelte']) return null;

    const isSvelteKit = !!deps['@sveltejs/kit'];
    const scripts = packageJson.scripts || {};

    return {
      framework: isSvelteKit ? 'sveltekit' : 'svelte',
      language: deps['typescript'] ? 'typescript' : 'javascript',
      packageManager: await detectPackageManager(projectPath),
      projectType: isSvelteKit ? 'fullstack' : 'frontend',
      buildCommand: scripts.build || (isSvelteKit ? 'vite build' : 'vite build'),
      installCommand: await getInstallCommand(projectPath),
      startCommand: scripts.preview || 'vite preview',
      outputDirectory: isSvelteKit ? 'build' : 'dist',
      nodeVersion: packageJson.engines?.node || '20',
      port: 4173,
      env: {},
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 85,
    };
  },
};

// ===========================================
// EXPRESS DETECTOR
// ===========================================

const expressDetector: FrameworkDetector = {
  name: 'express',
  priority: 70,
  detect: async (projectPath, packageJson) => {
    if (!packageJson) return null;

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (!deps['express']) return null;

    const scripts = packageJson.scripts || {};
    const hasTypescript = !!deps['typescript'];

    return {
      framework: 'express',
      language: hasTypescript ? 'typescript' : 'javascript',
      packageManager: await detectPackageManager(projectPath),
      projectType: 'backend',
      buildCommand: hasTypescript ? (scripts.build || 'tsc') : null,
      installCommand: await getInstallCommand(projectPath),
      startCommand: scripts.start || 'node index.js',
      outputDirectory: hasTypescript ? 'dist' : null,
      nodeVersion: packageJson.engines?.node || '20',
      port: 3000,
      env: {},
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 80,
    };
  },
};

// ===========================================
// FASTIFY DETECTOR
// ===========================================

const fastifyDetector: FrameworkDetector = {
  name: 'fastify',
  priority: 70,
  detect: async (projectPath, packageJson) => {
    if (!packageJson) return null;

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (!deps['fastify']) return null;

    const scripts = packageJson.scripts || {};
    const hasTypescript = !!deps['typescript'];

    return {
      framework: 'fastify',
      language: hasTypescript ? 'typescript' : 'javascript',
      packageManager: await detectPackageManager(projectPath),
      projectType: 'backend',
      buildCommand: hasTypescript ? (scripts.build || 'tsc') : null,
      installCommand: await getInstallCommand(projectPath),
      startCommand: scripts.start || 'node index.js',
      outputDirectory: hasTypescript ? 'dist' : null,
      nodeVersion: packageJson.engines?.node || '20',
      port: 3000,
      env: {},
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 80,
    };
  },
};

// ===========================================
// NESTJS DETECTOR
// ===========================================

const nestjsDetector: FrameworkDetector = {
  name: 'nestjs',
  priority: 85,
  detect: async (projectPath, packageJson) => {
    if (!packageJson) return null;

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (!deps['@nestjs/core']) return null;

    const scripts = packageJson.scripts || {};

    return {
      framework: 'nestjs',
      language: 'typescript',
      packageManager: await detectPackageManager(projectPath),
      projectType: 'backend',
      buildCommand: scripts.build || 'nest build',
      installCommand: await getInstallCommand(projectPath),
      startCommand: scripts['start:prod'] || 'node dist/main.js',
      outputDirectory: 'dist',
      nodeVersion: packageJson.engines?.node || '20',
      port: 3000,
      env: {},
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 90,
    };
  },
};

// ===========================================
// PYTHON (FLASK/DJANGO/FASTAPI) DETECTOR
// ===========================================

const pythonDetector: FrameworkDetector = {
  name: 'flask',
  priority: 75,
  detect: async (projectPath) => {
    const requirementsFile = path.join(projectPath, 'requirements.txt');
    const pyprojectFile = path.join(projectPath, 'pyproject.toml');

    const hasRequirements = await fileExists(requirementsFile);
    const hasPyproject = await fileExists(pyprojectFile);

    if (!hasRequirements && !hasPyproject) return null;

    let framework: FrameworkType = 'flask';
    let startCommand = 'python app.py';
    let port = 5000;

    if (hasRequirements) {
      const content = await fs.readFile(requirementsFile, 'utf-8').catch(() => '');
      const lower = content.toLowerCase();
      if (lower.includes('django')) {
        framework = 'django';
        startCommand = 'gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2';
        port = 8000;
      } else if (lower.includes('fastapi') || lower.includes('uvicorn')) {
        framework = 'fastapi';
        startCommand = 'uvicorn main:app --host 0.0.0.0 --port 8000';
        port = 8000;
      } else if (lower.includes('streamlit')) {
        framework = 'streamlit' as FrameworkType;
        startCommand = 'streamlit run app.py --server.port=8501 --server.headless=true --server.address=0.0.0.0 --browser.gatherUsageStats=false';
        port = 8501;
      } else if (lower.includes('gradio')) {
        framework = 'gradio' as FrameworkType;
        startCommand = 'python app.py';
        port = 7860;
      } else if (lower.includes('flask')) {
        framework = 'flask';
        startCommand = 'gunicorn app:app --bind 0.0.0.0:5000 --workers 2';
        port = 5000;
      } else {
        // Scan Python source files for framework imports
        const pyFiles = ['app.py', 'main.py', 'server.py', 'run.py', 'wsgi.py'];
        for (const pyFile of pyFiles) {
          const pyPath = path.join(projectPath, pyFile);
          const src = await fs.readFile(pyPath, 'utf-8').catch(() => '');
          if (src.includes('import streamlit') || src.includes('from streamlit')) {
            framework = 'streamlit' as FrameworkType;
            startCommand = `streamlit run ${pyFile} --server.port=8501 --server.headless=true --server.address=0.0.0.0 --browser.gatherUsageStats=false`;
            port = 8501;
            break;
          }
          if (src.includes('import gradio') || src.includes('from gradio')) {
            framework = 'gradio' as FrameworkType;
            startCommand = `python ${pyFile}`;
            port = 7860;
            break;
          }
          if (src.includes('Flask(') || src.includes('from flask')) {
            framework = 'flask';
            startCommand = `gunicorn ${pyFile.replace('.py','')}:app --bind 0.0.0.0:5000 --workers 2`;
            port = 5000;
            break;
          }
          if (src.includes('FastAPI(') || src.includes('from fastapi')) {
            framework = 'fastapi';
            startCommand = `uvicorn ${pyFile.replace('.py','')}:app --host 0.0.0.0 --port 8000`;
            port = 8000;
            break;
          }
        }
      }
    }

    const packageManager: PackageManager = hasPyproject ? 'poetry' : 'pip';
    const installCommand = hasPyproject ? 'poetry install' : 'pip install -r requirements.txt';

    return {
      framework,
      language: 'python',
      packageManager,
      projectType: 'backend',
      buildCommand: null,
      installCommand,
      startCommand,
      outputDirectory: null,
      nodeVersion: null,
      port,
      env: {
        PYTHONUNBUFFERED: '1',
      },
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 75,
    };
  },
};

// ===========================================
// GO DETECTOR
// ===========================================

const goDetector: FrameworkDetector = {
  name: 'go',
  priority: 70,
  detect: async (projectPath) => {
    const goModFile = path.join(projectPath, 'go.mod');
    if (!await fileExists(goModFile)) return null;

    // Main file detection (for future use in build optimization)
    void await findFile(projectPath, ['main.go', 'cmd/main.go', 'cmd/server/main.go']);

    return {
      framework: 'go',
      language: 'go',
      packageManager: 'go',
      projectType: 'backend',
      buildCommand: 'go build -o app',
      installCommand: 'go mod download',
      startCommand: './app',
      outputDirectory: null,
      nodeVersion: null,
      port: 8080,
      env: {},
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 85,
    };
  },
};

// ===========================================
// STATIC SITE DETECTOR (fallback)
// ===========================================

const staticDetector: FrameworkDetector = {
  name: 'static',
  priority: 10,
  detect: async (projectPath) => {
    const hasIndex = await fileExists(path.join(projectPath, 'index.html'));
    const hasPublic = await fileExists(path.join(projectPath, 'public', 'index.html'));

    if (!hasIndex && !hasPublic) return null;

    return {
      framework: 'static',
      language: 'javascript',
      packageManager: 'none',
      projectType: 'static',
      buildCommand: null,
      installCommand: 'echo "No dependencies to install"',
      startCommand: 'npx serve -s .',
      outputDirectory: hasPublic ? 'public' : '.',
      nodeVersion: null,
      port: 3000,
      env: {},
      dockerfileExists: await fileExists(path.join(projectPath, 'Dockerfile')),
      confidence: 60,
    };
  },
};

// ===========================================
// DOCKER DETECTOR
// ===========================================

const dockerDetector: FrameworkDetector = {
  name: 'docker',
  priority: 5,
  detect: async (projectPath) => {
    const hasDockerfile = await fileExists(path.join(projectPath, 'Dockerfile'));
    if (!hasDockerfile) return null;

    // Read Dockerfile to detect exposed port
    let port = 3000;
    try {
      const dockerfile = await fs.readFile(path.join(projectPath, 'Dockerfile'), 'utf-8');
      const exposeMatch = dockerfile.match(/EXPOSE\s+(\d+)/i);
      if (exposeMatch) {
        port = parseInt(exposeMatch[1], 10);
      }
    } catch {
      // Ignore read errors
    }

    return {
      framework: 'docker',
      language: 'unknown',
      packageManager: 'none',
      projectType: 'unknown',
      buildCommand: null,
      installCommand: 'echo "Using Dockerfile"',
      startCommand: null,
      outputDirectory: null,
      nodeVersion: null,
      port,
      env: {},
      dockerfileExists: true,
      confidence: 100, // If they have a Dockerfile, trust it
    };
  },
};

// ===========================================
// ALL DETECTORS
// ===========================================

const detectors: FrameworkDetector[] = [
  nextjsDetector,
  nuxtDetector,
  nestjsDetector,
  reactDetector,
  vueDetector,
  svelteDetector,
  expressDetector,
  fastifyDetector,
  pythonDetector,
  goDetector,
  staticDetector,
  dockerDetector,
].sort((a, b) => b.priority - a.priority);

// ===========================================
// MAIN DETECT FUNCTION
// ===========================================

export async function detectProject(projectPath: string): Promise<DetectionResult> {
  logger.info({ projectPath }, 'Starting project detection');

  // Check if project has a Dockerfile first (highest priority)
  const dockerResult = await dockerDetector.detect(projectPath);
  if (dockerResult && dockerResult.confidence === 100) {
    logger.info({ framework: 'docker' }, 'Dockerfile found, using Docker build');
    return dockerResult;
  }

  // Try to read package.json
  let packageJson: PackageJson | undefined;
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(content);
  } catch {
    logger.debug('No package.json found');
  }

  // Run all detectors
  for (const detector of detectors) {
    try {
      const result = await detector.detect(projectPath, packageJson);
      if (result) {
        logger.info({
          framework: result.framework,
          language: result.language,
          confidence: result.confidence,
        }, 'Project detected');
        return { ...result, projectPath };
      }
    } catch (error) {
      logger.warn({ detector: detector.name, error }, 'Detector error');
    }
  }

  // Default fallback
  logger.warn({ projectPath }, 'Could not detect project type, using defaults');
  return {
    framework: 'unknown',
    language: 'unknown',
    packageManager: packageJson ? await detectPackageManager(projectPath) : 'none',
    projectType: 'unknown',
    buildCommand: packageJson?.scripts?.build || null,
    installCommand: packageJson ? await getInstallCommand(projectPath) : 'echo "No install required"',
    startCommand: packageJson?.scripts?.start || null,
    outputDirectory: null,
    nodeVersion: packageJson?.engines?.node || null,
    port: 3000,
    env: {},
    dockerfileExists: false,
    confidence: 10,
  };
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findFile(dir: string, candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const fullPath = path.join(dir, candidate);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

async function detectPackageManager(projectPath: string): Promise<PackageManager> {
  // Check for lock files in order of preference
  if (await fileExists(path.join(projectPath, 'bun.lockb'))) return 'bun';
  if (await fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (await fileExists(path.join(projectPath, 'package-lock.json'))) return 'npm';
  if (await fileExists(path.join(projectPath, 'package.json'))) return 'npm'; // Default to npm

  return 'none';
}

async function getInstallCommand(projectPath: string): Promise<string> {
  const pm = await detectPackageManager(projectPath);
  switch (pm) {
    case 'bun': return 'bun install';
    case 'pnpm': return 'pnpm install --frozen-lockfile';
    case 'yarn': return 'yarn install --frozen-lockfile';
    case 'npm': return 'npm ci';
    default: return 'npm install';
  }
}

export default {
  detectProject,
  detectPackageManager,
};
