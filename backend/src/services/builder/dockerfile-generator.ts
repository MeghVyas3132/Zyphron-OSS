// ===========================================
// DOCKERFILE GENERATOR SERVICE
// Auto-generates optimized Dockerfiles for any framework
// ===========================================

import { createLogger } from '../../lib/logger.js';
import type { DetectionResult, PackageManager } from '../detector/index.js';

const logger = createLogger('dockerfile-generator');

// ===========================================
// TYPES
// ===========================================

export interface DockerfileConfig {
  baseImage: string;
  buildStage: boolean;
  installCommand: string;
  buildCommand: string | null;
  startCommand: string;
  port: number;
  env: Record<string, string>;
  copyPaths: string[];
  cacheDirectories: string[];
  healthCheck?: string;
  user?: string;
  workdir: string;
}

export interface GeneratedDockerfile {
  dockerfile: string;
  dockerignore: string;
  config: DockerfileConfig;
  optimizations: string[];
}

// ===========================================
// BASE IMAGES
// ===========================================

const BASE_IMAGES = {
  node: {
    '20': 'node:20-alpine',
    '18': 'node:18-alpine',
    '16': 'node:16-alpine',
    default: 'node:20-alpine',
  },
  python: {
    '3.12': 'python:3.12-slim',
    '3.11': 'python:3.11-slim',
    '3.10': 'python:3.10-slim',
    default: 'python:3.12-slim',
  },
  go: {
    '1.22': 'golang:1.22-alpine',
    '1.21': 'golang:1.21-alpine',
    default: 'golang:1.22-alpine',
  },
  rust: {
    default: 'rust:1-alpine',
  },
  ruby: {
    '3.3': 'ruby:3.3-slim',
    '3.2': 'ruby:3.2-slim',
    default: 'ruby:3.3-slim',
  },
};

// ===========================================
// DOCKERFILE GENERATOR CLASS
// ===========================================

export class DockerfileGenerator {
  /**
   * Generate an optimized Dockerfile based on detection results
   */
  generate(detection: DetectionResult): GeneratedDockerfile {
    logger.info({ framework: detection.framework }, 'Generating Dockerfile');

    const config = this.getConfig(detection);
    const dockerfile = this.buildDockerfile(detection, config);
    const dockerignore = this.buildDockerignore(detection);
    const optimizations = this.getOptimizations(detection);

    return {
      dockerfile,
      dockerignore,
      config,
      optimizations,
    };
  }

  /**
   * Get Docker configuration for a framework
   */
  private getConfig(detection: DetectionResult): DockerfileConfig {
    const baseConfig: DockerfileConfig = {
      baseImage: this.getBaseImage(detection),
      buildStage: true,
      installCommand: detection.installCommand,
      buildCommand: detection.buildCommand,
      startCommand: detection.startCommand || 'node index.js',
      port: detection.port,
      env: detection.env,
      copyPaths: ['.'],
      cacheDirectories: [],
      workdir: '/app',
    };

    // Framework-specific configurations
    switch (detection.framework) {
      case 'nextjs':
        return {
          ...baseConfig,
          startCommand: 'node server.js',
          copyPaths: [
            'public',
            '.next/standalone',
            '.next/static',
          ],
          healthCheck: 'wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1',
          user: 'nextjs',
        };

      case 'react':
      case 'vue':
      case 'svelte':
        return {
          ...baseConfig,
          buildStage: true,
          baseImage: 'nginx:alpine',
          startCommand: 'nginx -g "daemon off;"',
          port: 80,
          copyPaths: ['dist', 'build'],
          healthCheck: 'wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1',
        };

      case 'express':
      case 'fastify':
      case 'nestjs':
        return {
          ...baseConfig,
          healthCheck: `wget --no-verbose --tries=1 --spider http://localhost:${detection.port}/health || exit 1`,
          user: 'node',
        };

      case 'django':
        return {
          ...baseConfig,
          baseImage: BASE_IMAGES.python.default,
          installCommand: 'pip install --no-cache-dir -r requirements.txt',
          buildCommand: 'python manage.py collectstatic --noinput',
          startCommand: 'gunicorn config.wsgi:application --bind 0.0.0.0:8000',
          cacheDirectories: ['/root/.cache/pip'],
          healthCheck: 'curl -f http://localhost:8000/health/ || exit 1',
        };

      case 'fastapi':
        return {
          ...baseConfig,
          baseImage: BASE_IMAGES.python.default,
          installCommand: 'pip install --no-cache-dir -r requirements.txt',
          buildCommand: null,
          startCommand: 'uvicorn main:app --host 0.0.0.0 --port 8000',
          cacheDirectories: ['/root/.cache/pip'],
          healthCheck: 'curl -f http://localhost:8000/health || exit 1',
        };

      case 'flask':
        return {
          ...baseConfig,
          baseImage: BASE_IMAGES.python.default,
          installCommand: 'pip install --no-cache-dir -r requirements.txt',
          buildCommand: null,
          startCommand: detection.startCommand || 'gunicorn app:app --bind 0.0.0.0:5000',
          port: detection.port || 5000,
          cacheDirectories: ['/root/.cache/pip'],
        };

      case 'streamlit':
        return {
          ...baseConfig,
          baseImage: BASE_IMAGES.python.default,
          installCommand: 'pip install --no-cache-dir -r requirements.txt',
          buildCommand: null,
          startCommand: detection.startCommand || 'streamlit run app.py --server.port=8501 --server.headless=true --server.address=0.0.0.0 --browser.gatherUsageStats=false',
          port: 8501,
          cacheDirectories: ['/root/.cache/pip'],
          healthCheck: 'curl -f http://localhost:8501/_stcore/health || exit 1',
        };

      case 'gradio':
        return {
          ...baseConfig,
          baseImage: BASE_IMAGES.python.default,
          installCommand: 'pip install --no-cache-dir -r requirements.txt',
          buildCommand: null,
          startCommand: detection.startCommand || 'python app.py',
          port: 7860,
          cacheDirectories: ['/root/.cache/pip'],
          healthCheck: 'curl -f http://localhost:7860 || exit 1',
        };

      case 'go':
        return {
          ...baseConfig,
          baseImage: BASE_IMAGES.go.default,
          installCommand: 'go mod download',
          buildCommand: 'CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o app .',
          startCommand: './app',
          cacheDirectories: ['/go/pkg/mod'],
        };

      case 'rust':
        return {
          ...baseConfig,
          baseImage: BASE_IMAGES.rust.default,
          installCommand: 'cargo fetch',
          buildCommand: 'cargo build --release',
          startCommand: './target/release/app',
          cacheDirectories: ['/usr/local/cargo/registry', 'target'],
        };

      case 'rails':
        return {
          ...baseConfig,
          baseImage: BASE_IMAGES.ruby.default,
          installCommand: 'bundle install',
          buildCommand: 'bundle exec rails assets:precompile',
          startCommand: 'bundle exec puma -C config/puma.rb',
          cacheDirectories: ['/usr/local/bundle'],
        };

      default:
        return baseConfig;
    }
  }

  /**
   * Get the appropriate base image
   */
  private getBaseImage(detection: DetectionResult): string {
    switch (detection.language) {
      case 'typescript':
      case 'javascript':
        const nodeVersion = detection.nodeVersion || '20';
        return BASE_IMAGES.node[nodeVersion as keyof typeof BASE_IMAGES.node] || BASE_IMAGES.node.default;
      case 'python':
        return BASE_IMAGES.python.default;
      case 'go':
        return BASE_IMAGES.go.default;
      case 'rust':
        return BASE_IMAGES.rust.default;
      case 'ruby':
        return BASE_IMAGES.ruby.default;
      default:
        return BASE_IMAGES.node.default;
    }
  }

  /**
   * Build the Dockerfile content
   */
  private buildDockerfile(detection: DetectionResult, config: DockerfileConfig): string {
    const lines: string[] = [];
    const addLine = (line: string) => lines.push(line);
    const addBlank = () => lines.push('');

    // Static site build (React, Vue, Svelte)
    if (['react', 'vue', 'svelte', 'angular'].includes(detection.framework)) {
      return this.buildStaticSiteDockerfile(detection, config);
    }

    // Next.js with standalone output
    if (detection.framework === 'nextjs') {
      return this.buildNextjsDockerfile(detection, config);
    }

    // Go with multi-stage build
    if (detection.framework === 'go') {
      return this.buildGoDockerfile(detection, config);
    }

    // Rust with multi-stage build
    if (detection.framework === 'rust') {
      return this.buildRustDockerfile(detection, config);
    }

    // Python apps (all variants)
    if (['django', 'fastapi', 'flask', 'streamlit', 'gradio', 'python'].includes(detection.framework)
        || detection.language === 'python') {
      return this.buildPythonDockerfile(detection, config);
    }

    // Default Node.js Dockerfile
    addLine('# ===========================================');
    addLine(`# Dockerfile for ${detection.framework}`);
    addLine('# Auto-generated by Zyphron');
    addLine('# ===========================================');
    addBlank();

    // Build stage
    addLine('# Build stage');
    addLine(`FROM ${config.baseImage} AS builder`);
    addBlank();
    addLine(`WORKDIR ${config.workdir}`);
    addBlank();

    // Copy package files first for better caching
    addLine('# Copy dependency files');
    addLine(this.getCopyPackageFiles(detection.packageManager));
    addBlank();

    // Install dependencies
    addLine('# Install dependencies');
    addLine(`RUN ${config.installCommand}`);
    addBlank();

    // Copy source
    addLine('# Copy source code');
    addLine('COPY . .');
    addBlank();

    // Build if needed
    if (config.buildCommand) {
      addLine('# Build application');
      addLine(`RUN ${config.buildCommand}`);
      addBlank();
    }

    // Production stage
    addLine('# Production stage');
    addLine(`FROM ${config.baseImage} AS runner`);
    addBlank();
    addLine(`WORKDIR ${config.workdir}`);
    addBlank();

    // Set environment
    addLine('# Set environment');
    addLine('ENV NODE_ENV=production');
    for (const [key, value] of Object.entries(config.env)) {
      addLine(`ENV ${key}=${value}`);
    }
    addBlank();

    // Create non-root user
    if (config.user) {
      addLine('# Create non-root user');
      addLine(`RUN addgroup --system --gid 1001 ${config.user}`);
      addLine(`RUN adduser --system --uid 1001 ${config.user}`);
      addBlank();
    }

    // Copy from builder
    addLine('# Copy built artifacts');
    addLine(`COPY --from=builder ${config.workdir}/node_modules ./node_modules`);
    addLine(`COPY --from=builder ${config.workdir}/package.json ./package.json`);
    if (config.buildCommand) {
      addLine(`COPY --from=builder ${config.workdir}/dist ./dist`);
    } else {
      addLine(`COPY --from=builder ${config.workdir} .`);
    }
    addBlank();

    // Set user
    if (config.user) {
      addLine(`USER ${config.user}`);
      addBlank();
    }

    // Expose port
    addLine(`EXPOSE ${config.port}`);
    addBlank();

    // Health check
    if (config.healthCheck) {
      addLine(`HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\`);
      addLine(`  CMD ${config.healthCheck}`);
      addBlank();
    }

    // Start command
    addLine(`CMD ${this.formatCmd(config.startCommand)}`);

    return lines.join('\n');
  }

  /**
   * Build Dockerfile for static sites (React, Vue, etc.)
   */
  private buildStaticSiteDockerfile(detection: DetectionResult, _config: DockerfileConfig): string {
    const outputDir = detection.outputDirectory || 'dist';

    return `# ===========================================
# Dockerfile for ${detection.framework} (Static Site)
# Auto-generated by Zyphron
# ===========================================

# Build stage
FROM ${this.getBaseImage(detection)} AS builder

WORKDIR /app

# Copy dependency files
${this.getCopyPackageFiles(detection.packageManager)}

# Install dependencies
RUN ${detection.installCommand}

# Copy source code
COPY . .

# Build application
RUN ${detection.buildCommand || 'npm run build'}

# Production stage - Nginx
FROM nginx:alpine AS runner

# Copy custom nginx config
COPY --from=builder /app/${outputDir} /usr/share/nginx/html

# Copy nginx configuration for SPA routing
RUN echo 'server { \\
    listen 80; \\
    location / { \\
        root /usr/share/nginx/html; \\
        index index.html; \\
        try_files $uri $uri/ /index.html; \\
    } \\
    location /assets { \\
        root /usr/share/nginx/html; \\
        expires 1y; \\
        add_header Cache-Control "public, immutable"; \\
    } \\
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
`;
  }

  /**
   * Build Dockerfile for Next.js with standalone output
   */
  private buildNextjsDockerfile(detection: DetectionResult, _config: DockerfileConfig): string {
    return `# ===========================================
# Dockerfile for Next.js (Standalone Output)
# Auto-generated by Zyphron
# ===========================================

# Dependencies stage
FROM ${this.getBaseImage(detection)} AS deps

WORKDIR /app

# Copy dependency files
${this.getCopyPackageFiles(detection.packageManager)}

# Install dependencies
RUN ${detection.installCommand}

# Build stage
FROM ${this.getBaseImage(detection)} AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js
RUN ${detection.buildCommand || 'npm run build'}

# Production stage
FROM ${this.getBaseImage(detection)} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
`;
  }

  /**
   * Build Dockerfile for Go applications
   */
  private buildGoDockerfile(_detection: DetectionResult, _config: DockerfileConfig): string {
    return `# ===========================================
# Dockerfile for Go
# Auto-generated by Zyphron
# ===========================================

# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install git for fetching dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags="-w -s" -o app .

# Production stage - scratch image for minimal size
FROM alpine:latest AS runner

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Copy binary from builder
COPY --from=builder /app/app .

# Create non-root user
RUN adduser -D -g '' appuser
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["./app"]
`;
  }

  /**
   * Build Dockerfile for Rust applications
   */
  private buildRustDockerfile(_detection: DetectionResult, _config: DockerfileConfig): string {
    return `# ===========================================
# Dockerfile for Rust
# Auto-generated by Zyphron
# ===========================================

# Build stage
FROM rust:1-alpine AS builder

WORKDIR /app

# Install musl-dev for static linking
RUN apk add --no-cache musl-dev

# Copy cargo files
COPY Cargo.toml Cargo.lock ./

# Create dummy main.rs for dependency caching
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies
RUN cargo build --release

# Remove dummy build
RUN rm -rf src target/release/deps/app*

# Copy source code
COPY . .

# Build application
RUN cargo build --release

# Production stage
FROM alpine:latest AS runner

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Copy binary from builder
COPY --from=builder /app/target/release/app .

# Create non-root user
RUN adduser -D -g '' appuser
USER appuser

EXPOSE 8080

CMD ["./app"]
`;
  }

  /**
   * Build Dockerfile for Python applications
   */
  /**
   * Maps Python import names to pip package names when they differ.
   * Zyphron uses this to auto-inject packages that are imported but
   * missing from requirements.txt / pyproject.toml.
   */
  private static readonly IMPORT_TO_PACKAGE: Record<string, string> = {
    // Very common mismatches
    dotenv:          'python-dotenv',
    cv2:             'opencv-python-headless',
    PIL:             'Pillow',
    sklearn:         'scikit-learn',
    skimage:         'scikit-image',
    yaml:            'PyYAML',
    bs4:             'beautifulsoup4',
    dateutil:        'python-dateutil',
    attr:            'attrs',
    jwt:             'PyJWT',
    cryptography:    'cryptography',
    boto3:           'boto3',
    botocore:        'botocore',
    google:          'google-cloud-core',
    psycopg2:        'psycopg2-binary',
    MySQLdb:         'mysqlclient',
    pymongo:         'pymongo',
    redis:           'redis',
    celery:          'celery',
    pydantic:        'pydantic',
    httpx:           'httpx',
    aiohttp:         'aiohttp',
    fastapi:         'fastapi',
    uvicorn:         'uvicorn[standard]',
    streamlit:       'streamlit',
    gradio:          'gradio',
    torch:                 'torch',
    tensorflow:            'tensorflow',
    keras:                 'keras',
    numpy:                 'numpy',
    pandas:                'pandas',
    matplotlib:            'matplotlib',
    seaborn:               'seaborn',
    plotly:                'plotly',
    scipy:                 'scipy',
    nltk:                  'nltk',
    spacy:                 'spacy',
    transformers:          'transformers',
    sentence_transformers: 'sentence-transformers',
    chromadb:              'chromadb',
    faiss:                 'faiss-cpu',
    langchain:             'langchain',
    openai:                'openai',
    anthropic:             'anthropic',
    groq:                  'groq',
    cohere:                'cohere',
    tiktoken:              'tiktoken',
    huggingface_hub:       'huggingface-hub',
    datasets:              'datasets',
    tokenizers:            'tokenizers',
    xgboost:               'xgboost',
    lightgbm:              'lightgbm',
    catboost:              'catboost',
    shap:                  'shap',
    optuna:                'optuna',
    wandb:                 'wandb',
    mlflow:                'mlflow',
    stripe:          'stripe',
    twilio:          'twilio',
    sendgrid:        'sendgrid',
    sqlalchemy:      'SQLAlchemy',
    alembic:         'alembic',
    passlib:         'passlib',
    bcrypt:          'bcrypt',
    arrow:           'arrow',
    pendulum:        'pendulum',
    rich:            'rich',
    click:           'click',
    typer:           'typer',
  };

  /**
   * Scan Python source files for import statements and return
   * any packages that appear to be missing from the requirements.
   */
  private scanPythonImports(projectPath: string, existingRequirements: string): string[] {
    // This runs synchronously at Dockerfile generation time.
    // We read files synchronously using Node's require-path sync APIs.
    const missing: string[] = [];
    const reqLower = existingRequirements.toLowerCase();

    // Collect all top-level import names from the project
    const importedNames = new Set<string>();
    try {
      const fss = require('fs') as typeof import('fs');
      const pathMod = require('path') as typeof import('path');

      const scanDir = (dir: string, depth = 0) => {
        if (depth > 3) return;
        let entries: string[] = [];
        try { entries = fss.readdirSync(dir); } catch { return; }
        for (const entry of entries) {
          if (entry.startsWith('.') || entry === 'node_modules' || entry === '__pycache__' || entry === '.venv' || entry === 'venv') continue;
          const full = pathMod.join(dir, entry);
          let stat: import('fs').Stats;
          try { stat = fss.statSync(full); } catch { continue; }
          if (stat.isDirectory()) { scanDir(full, depth + 1); continue; }
          if (!entry.endsWith('.py')) continue;
          let src = '';
          try { src = fss.readFileSync(full, 'utf-8'); } catch { continue; }
          // Match: import X, from X import Y, import X as Y
          const matches = src.matchAll(/^(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm);
          for (const m of matches) importedNames.add(m[1]);
        }
      };
      scanDir(projectPath);
    } catch { /* non-fatal */ }

    for (const importName of importedNames) {
      const pipPkg = DockerfileGenerator.IMPORT_TO_PACKAGE[importName];
      if (!pipPkg) continue;
      // Check if it's already in requirements (any form)
      const pkgBase = pipPkg.split('[')[0].toLowerCase().replace(/-/g, '').replace(/_/g, '');
      const importBase = importName.toLowerCase().replace(/-/g, '').replace(/_/g, '');
      const alreadyListed = reqLower.replace(/-/g, '').replace(/_/g, '').includes(pkgBase)
        || reqLower.replace(/-/g, '').replace(/_/g, '').includes(importBase);
      if (!alreadyListed) missing.push(pipPkg);
    }

    return [...new Set(missing)];
  }

  private buildPythonDockerfile(detection: DetectionResult, config: DockerfileConfig): string {
    const isPipenv = detection.packageManager === 'pipenv' as PackageManager;
    const isPoetry = detection.packageManager === 'poetry';

    let installCmd = 'pip install --no-cache-dir -r requirements.txt';
    let copyDeps = 'COPY requirements.txt .';

    // ── Auto-inject missing packages ────────────────────────────
    // Scan source imports and auto-add anything not in requirements.txt
    let autoInjectLine = '';
    if (!isPipenv && !isPoetry) {
      try {
        const fss = require('fs') as typeof import('fs');
        const reqPath = require('path').join(detection.projectPath ?? '', 'requirements.txt');
        const existingReq = fss.existsSync(reqPath) ? fss.readFileSync(reqPath, 'utf-8') : '';
        const missing = this.scanPythonImports(detection.projectPath ?? '', existingReq);
        if (missing.length > 0) {
          logger.info({ missing }, 'Auto-injecting missing Python packages');
          autoInjectLine = `\n# Auto-injected by Zyphron (imported but missing from requirements.txt)\nRUN pip install --no-cache-dir ${missing.join(' ')}`;
        }
      } catch { /* non-fatal */ }
    }

    if (isPipenv) {
      copyDeps = 'COPY Pipfile Pipfile.lock .';
      installCmd = 'pip install pipenv && pipenv install --system --deploy';
    } else if (isPoetry) {
      copyDeps = 'COPY pyproject.toml poetry.lock .';
      installCmd = 'pip install poetry && poetry config virtualenvs.create false && poetry install --no-dev';
    }

    return `# ===========================================
# Dockerfile for ${detection.framework}
# Auto-generated by Zyphron
# ===========================================

# Build stage
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential curl \\
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files
${copyDeps}

# Install declared dependencies
RUN ${installCmd}
${autoInjectLine}

# Copy source code
COPY . .

${config.buildCommand ? `# Build assets\nRUN ${config.buildCommand}` : ''}

# Production stage
FROM python:3.12-slim AS runner

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application
COPY --from=builder /app .

# Create non-root user
RUN useradd -m -u 1001 appuser
USER appuser

EXPOSE ${config.port}

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${config.port}/health || exit 1

CMD ${this.formatCmd(config.startCommand)}
`;
  }

  /**
   * Build .dockerignore content
   */
  private buildDockerignore(detection: DetectionResult): string {
    const common = [
      '# Git',
      '.git',
      '.gitignore',
      '',
      '# IDE',
      '.idea',
      '.vscode',
      '*.swp',
      '*.swo',
      '',
      '# OS',
      '.DS_Store',
      'Thumbs.db',
      '',
      '# Logs',
      '*.log',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*',
      '',
      '# Environment',
      '.env',
      '.env.local',
      '.env.*.local',
      '',
      '# Docker',
      'Dockerfile',
      '.dockerignore',
      'docker-compose*.yml',
      '',
      '# Documentation',
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
      'docs/',
    ];

    const languageSpecific: Record<string, string[]> = {
      javascript: [
        '',
        '# Node.js',
        'node_modules',
        '.npm',
        '.next',
        'dist',
        'build',
        'coverage',
        '.nyc_output',
      ],
      typescript: [
        '',
        '# Node.js / TypeScript',
        'node_modules',
        '.npm',
        '.next',
        'dist',
        'build',
        'coverage',
        '.nyc_output',
        '*.tsbuildinfo',
      ],
      python: [
        '',
        '# Python',
        '__pycache__',
        '*.py[cod]',
        '*$py.class',
        '.Python',
        'venv',
        '.venv',
        'env',
        '.pytest_cache',
        '.mypy_cache',
        '.coverage',
        'htmlcov',
      ],
      go: [
        '',
        '# Go',
        '*.exe',
        '*.test',
        '*.out',
        'vendor/',
      ],
      rust: [
        '',
        '# Rust',
        'target/',
        '**/*.rs.bk',
        'Cargo.lock',
      ],
    };

    const specific = languageSpecific[detection.language] || languageSpecific.javascript;

    return [...common, ...specific].join('\n');
  }

  /**
   * Get optimization suggestions
   */
  private getOptimizations(detection: DetectionResult): string[] {
    const optimizations: string[] = [];

    optimizations.push('Multi-stage build for minimal image size');
    optimizations.push('Non-root user for security');
    optimizations.push('Health check for container orchestration');

    switch (detection.framework) {
      case 'nextjs':
        optimizations.push('Standalone output mode for optimal bundle');
        optimizations.push('Static asset caching');
        break;
      case 'react':
      case 'vue':
        optimizations.push('Nginx with SPA routing');
        optimizations.push('Asset caching with immutable headers');
        break;
      case 'go':
        optimizations.push('Static binary with CGO disabled');
        optimizations.push('Alpine base for minimal size');
        break;
      case 'rust':
        optimizations.push('Release build with optimizations');
        optimizations.push('Dependency caching');
        break;
      case 'django':
      case 'fastapi':
        optimizations.push('Gunicorn/Uvicorn for production');
        optimizations.push('Static file collection');
        break;
    }

    return optimizations;
  }

  /**
   * Get copy command for package files
   */
  private getCopyPackageFiles(packageManager: PackageManager): string {
    switch (packageManager) {
      case 'npm':
        return 'COPY package.json package-lock.json* ./';
      case 'yarn':
        return 'COPY package.json yarn.lock* ./';
      case 'pnpm':
        return 'COPY package.json pnpm-lock.yaml* ./';
      case 'bun':
        return 'COPY package.json bun.lockb* ./';
      case 'pip':
        return 'COPY requirements.txt ./';
      case 'poetry':
        return 'COPY pyproject.toml poetry.lock* ./';
      case 'cargo':
        return 'COPY Cargo.toml Cargo.lock ./';
      case 'go':
        return 'COPY go.mod go.sum ./';
      default:
        return 'COPY package.json ./';
    }
  }

  /**
   * Format command for CMD instruction
   */
  private formatCmd(command: string): string {
    const parts = command.split(' ').filter(Boolean);
    return `[${parts.map(p => `"${p}"`).join(', ')}]`;
  }
}

// Export singleton
export const dockerfileGenerator = new DockerfileGenerator();
