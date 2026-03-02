// ===========================================
// BUILDER SERVICE
// Handles Docker image building and pushing to registry
// ===========================================

import Docker from 'dockerode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as tar from 'tar';
import { createLogger } from '../../lib/logger.js';
import { DetectionResult } from '../detector/index.js';

const logger = createLogger('builder');

// ===========================================
// TYPES
// ===========================================

export interface BuildOptions {
  projectPath: string;
  deploymentId: string;
  projectId: string;
  detection: DetectionResult;
  envVars?: Record<string, string>;
  buildArgs?: Record<string, string>;
  registryUrl?: string;
  onLog?: (log: string) => void;
}

export interface BuildResult {
  success: boolean;
  imageId?: string;
  imageName: string;
  imageTag: string;
  registryUrl?: string;
  buildLogs: string[];
  error?: string;
  duration: number;
}

export interface PushResult {
  success: boolean;
  digest?: string;
  error?: string;
}

// ===========================================
// DOCKERFILE TEMPLATES
// ===========================================

const DOCKERFILE_TEMPLATES: Record<string, (detection: DetectionResult) => string> = {
  // Next.js standalone build
  nextjs: (d) => `
# Stage 1: Dependencies
FROM node:${d.nodeVersion || '20'}-alpine AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
${d.packageManager === 'yarn' ? 'COPY yarn.lock ./' : ''}
${d.packageManager === 'pnpm' ? 'COPY pnpm-lock.yaml ./' : ''}

# Install dependencies
RUN ${d.installCommand}

# Stage 2: Builder
FROM node:${d.nodeVersion || '20'}-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED 1

# Build the application
RUN ${d.buildCommand || 'npm run build'}

# Stage 3: Runner
FROM node:${d.nodeVersion || '20'}-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
`.trim(),

  // React (Vite/CRA) with nginx
  react: (d) => `
# Stage 1: Build
FROM node:${d.nodeVersion || '20'}-alpine AS builder
WORKDIR /app

COPY package*.json ./
${d.packageManager === 'yarn' ? 'COPY yarn.lock ./' : ''}
${d.packageManager === 'pnpm' ? 'COPY pnpm-lock.yaml ./' : ''}

RUN ${d.installCommand}

COPY . .
RUN ${d.buildCommand || 'npm run build'}

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/${d.outputDirectory || 'dist'} /usr/share/nginx/html

# Custom nginx config for SPA routing
RUN echo 'server { \\
  listen 80; \\
  location / { \\
    root /usr/share/nginx/html; \\
    index index.html; \\
    try_files $uri $uri/ /index.html; \\
  } \\
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`.trim(),

  // Vue with nginx
  vue: (d) => `
# Stage 1: Build
FROM node:${d.nodeVersion || '20'}-alpine AS builder
WORKDIR /app

COPY package*.json ./
${d.packageManager === 'yarn' ? 'COPY yarn.lock ./' : ''}
${d.packageManager === 'pnpm' ? 'COPY pnpm-lock.yaml ./' : ''}

RUN ${d.installCommand}

COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/${d.outputDirectory || 'dist'} /usr/share/nginx/html

RUN echo 'server { \\
  listen 80; \\
  location / { \\
    root /usr/share/nginx/html; \\
    index index.html; \\
    try_files $uri $uri/ /index.html; \\
  } \\
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`.trim(),

  // Express/Fastify/Node backend
  express: (d) => `
FROM node:${d.nodeVersion || '20'}-alpine
WORKDIR /app

COPY package*.json ./
${d.packageManager === 'yarn' ? 'COPY yarn.lock ./' : ''}
${d.packageManager === 'pnpm' ? 'COPY pnpm-lock.yaml ./' : ''}

RUN ${d.installCommand}

COPY . .

${d.buildCommand ? `RUN ${d.buildCommand}` : ''}

ENV NODE_ENV production
EXPOSE ${d.port || 3000}

CMD ${JSON.stringify((d.startCommand || 'node index.js').split(' '))}
`.trim(),

  fastify: (d) => DOCKERFILE_TEMPLATES.express(d),
  
  nestjs: (d) => `
# Stage 1: Build
FROM node:${d.nodeVersion || '20'}-alpine AS builder
WORKDIR /app

COPY package*.json ./
${d.packageManager === 'yarn' ? 'COPY yarn.lock ./' : ''}
${d.packageManager === 'pnpm' ? 'COPY pnpm-lock.yaml ./' : ''}

RUN ${d.installCommand}

COPY . .
RUN ${d.buildCommand || 'npm run build'}

# Stage 2: Production
FROM node:${d.nodeVersion || '20'}-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

ENV NODE_ENV production
EXPOSE ${d.port || 3000}

CMD ["node", "dist/main.js"]
`.trim(),

  // Python Flask/Django/FastAPI
  flask: (d) => `
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED 1
EXPOSE ${d.port || 5000}

CMD ["python", "app.py"]
`.trim(),

  django: (_d) => `
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED 1
EXPOSE 8000

RUN python manage.py collectstatic --noinput

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "config.wsgi:application"]
`.trim(),

  fastapi: (_d) => `
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED 1
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`.trim(),

  // Go
  go: (d) => `
# Stage 1: Build
FROM golang:1.21-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o app

# Stage 2: Run
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/

COPY --from=builder /app/app .

EXPOSE ${d.port || 8080}
CMD ["./app"]
`.trim(),

  // Static files
  static: (d) => `
FROM nginx:alpine
COPY ${d.outputDirectory || '.'} /usr/share/nginx/html

RUN echo 'server { \\
  listen 80; \\
  location / { \\
    root /usr/share/nginx/html; \\
    index index.html; \\
    try_files $uri $uri/ /index.html; \\
  } \\
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`.trim(),

  // Default fallback
  unknown: (d) => `
FROM node:${d.nodeVersion || '20'}-alpine
WORKDIR /app

COPY . .

${d.installCommand ? `RUN ${d.installCommand}` : ''}
${d.buildCommand ? `RUN ${d.buildCommand}` : ''}

ENV NODE_ENV production
EXPOSE ${d.port || 3000}

CMD ${d.startCommand ? JSON.stringify(d.startCommand.split(' ')) : '["npm", "start"]'}
`.trim(),
};

// Add aliases
DOCKERFILE_TEMPLATES.nuxt = DOCKERFILE_TEMPLATES.nextjs;
DOCKERFILE_TEMPLATES.sveltekit = DOCKERFILE_TEMPLATES.nextjs;
DOCKERFILE_TEMPLATES.svelte = DOCKERFILE_TEMPLATES.react;
DOCKERFILE_TEMPLATES.angular = DOCKERFILE_TEMPLATES.react;
DOCKERFILE_TEMPLATES.remix = DOCKERFILE_TEMPLATES.nextjs;
DOCKERFILE_TEMPLATES.astro = DOCKERFILE_TEMPLATES.react;
DOCKERFILE_TEMPLATES.gatsby = DOCKERFILE_TEMPLATES.react;
DOCKERFILE_TEMPLATES.koa = DOCKERFILE_TEMPLATES.express;
DOCKERFILE_TEMPLATES.hono = DOCKERFILE_TEMPLATES.express;

// ===========================================
// BUILDER SERVICE CLASS
// ===========================================

export class BuilderService {
  private docker: Docker;
  private registryUrl: string;

  constructor(registryUrl: string = 'localhost:5000') {
    this.docker = new Docker();
    this.registryUrl = registryUrl;
  }

  // ===========================================
  // BUILD IMAGE
  // ===========================================

  async buildImage(options: BuildOptions): Promise<BuildResult> {
    const startTime = Date.now();
    const buildLogs: string[] = [];
    const { projectPath, deploymentId, projectId, detection, envVars, buildArgs, onLog } = options;

    const imageName = `${this.registryUrl}/zyphron/${projectId}`;
    const imageTag = deploymentId.substring(0, 8);
    const fullImageName = `${imageName}:${imageTag}`;

    logger.info({
      deploymentId,
      projectId,
      framework: detection.framework,
      imageName: fullImageName,
    }, 'Starting Docker build');

    try {
      // Check if project has its own Dockerfile
      let dockerfilePath: string;
      const customDockerfile = path.join(projectPath, 'Dockerfile');
      const hasCustomDockerfile = await this.fileExists(customDockerfile);

      if (hasCustomDockerfile && detection.dockerfileExists) {
        logger.info({ deploymentId }, 'Using project Dockerfile');
        dockerfilePath = customDockerfile;
      } else {
        // Generate Dockerfile based on detection
        logger.info({ deploymentId, framework: detection.framework }, 'Generating Dockerfile');
        const template = DOCKERFILE_TEMPLATES[detection.framework] || DOCKERFILE_TEMPLATES.unknown;
        const dockerfileContent = template(detection);

        // Write Dockerfile to project
        dockerfilePath = path.join(projectPath, 'Dockerfile.zyphron');
        await fs.writeFile(dockerfilePath, dockerfileContent);

        buildLogs.push(`📝 Generated Dockerfile for ${detection.framework} project`);
        this.logMessage(`Generated Dockerfile for ${detection.framework}`, onLog);
      }

      // Create .dockerignore if it doesn't exist
      const dockerignorePath = path.join(projectPath, '.dockerignore');
      if (!await this.fileExists(dockerignorePath)) {
        await fs.writeFile(dockerignorePath, `
node_modules
.git
.gitignore
*.md
.env*
.DS_Store
*.log
coverage
.next/cache
dist
build
__pycache__
*.pyc
.pytest_cache
.venv
venv
`.trim());
      }

      // Create tar stream of the project
      const tarStream = await this.createTarStream(projectPath);

      // Build arguments
      const buildArgsArray: Record<string, string> = {
        ...buildArgs,
        BUILDKIT_INLINE_CACHE: '1',
      };

      // Add env vars as build args
      if (envVars) {
        for (const [key, value] of Object.entries(envVars)) {
          buildArgsArray[key] = value;
        }
      }

      // Build the image
      buildLogs.push('🔨 Building Docker image...');
      this.logMessage('Building Docker image...', onLog);

      const stream = await this.docker.buildImage(tarStream, {
        t: fullImageName,
        dockerfile: hasCustomDockerfile ? 'Dockerfile' : 'Dockerfile.zyphron',
        buildargs: buildArgsArray,
        rm: true,
        forcerm: true,
        nocache: false,
      });

      // Wait for build to complete and collect logs
      const imageId = await new Promise<string>((resolve, reject) => {
        let lastImageId = '';

        this.docker.modem.followProgress(
          stream,
          (err, _res) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(lastImageId);
          },
          (event) => {
            if (event.stream) {
              const logLine = event.stream.trim();
              if (logLine) {
                buildLogs.push(logLine);
                this.logMessage(logLine, onLog);
              }
            }
            if (event.aux?.ID) {
              lastImageId = event.aux.ID;
            }
            if (event.error) {
              buildLogs.push(`❌ Error: ${event.error}`);
              this.logMessage(`Error: ${event.error}`, onLog);
            }
          }
        );
      });

      // Clean up generated Dockerfile
      if (!hasCustomDockerfile) {
        await fs.unlink(path.join(projectPath, 'Dockerfile.zyphron')).catch(() => {});
      }

      const duration = Date.now() - startTime;
      buildLogs.push(`✅ Build completed in ${Math.round(duration / 1000)}s`);
      this.logMessage(`Build completed in ${Math.round(duration / 1000)}s`, onLog);

      logger.info({
        deploymentId,
        imageId,
        duration,
      }, 'Docker build completed');

      return {
        success: true,
        imageId,
        imageName,
        imageTag,
        registryUrl: this.registryUrl,
        buildLogs,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown build error';
      
      buildLogs.push(`❌ Build failed: ${errorMessage}`);
      this.logMessage(`Build failed: ${errorMessage}`, onLog);

      logger.error({
        deploymentId,
        error: errorMessage,
        duration,
      }, 'Docker build failed');

      return {
        success: false,
        imageName,
        imageTag,
        buildLogs,
        error: errorMessage,
        duration,
      };
    }
  }

  // ===========================================
  // PUSH IMAGE TO REGISTRY
  // ===========================================

  async pushImage(imageName: string, imageTag: string): Promise<PushResult> {
    const fullImageName = `${imageName}:${imageTag}`;
    
    logger.info({ imageName: fullImageName }, 'Pushing image to registry');

    try {
      const image = this.docker.getImage(fullImageName);
      const stream = await image.push({});

      const digest = await new Promise<string>((resolve, reject) => {
        let lastDigest = '';

        this.docker.modem.followProgress(
          stream,
          (err, _res) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(lastDigest);
          },
          (event) => {
            if (event.aux?.Digest) {
              lastDigest = event.aux.Digest;
            }
            if (event.error) {
              logger.warn({ error: event.error }, 'Push warning');
            }
          }
        );
      });

      logger.info({ imageName: fullImageName, digest }, 'Image pushed successfully');

      return {
        success: true,
        digest,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown push error';
      logger.error({ imageName: fullImageName, error: errorMessage }, 'Push failed');

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // ===========================================
  // TAG IMAGE
  // ===========================================

  async tagImage(sourceImage: string, targetImage: string): Promise<boolean> {
    try {
      const image = this.docker.getImage(sourceImage);
      const [repo, tag] = targetImage.includes(':') 
        ? targetImage.split(':') 
        : [targetImage, 'latest'];
      
      await image.tag({ repo, tag });
      logger.info({ sourceImage, targetImage }, 'Image tagged');
      return true;
    } catch (error) {
      logger.error({ sourceImage, targetImage, error }, 'Failed to tag image');
      return false;
    }
  }

  // ===========================================
  // REMOVE IMAGE
  // ===========================================

  async removeImage(imageName: string): Promise<boolean> {
    try {
      const image = this.docker.getImage(imageName);
      await image.remove({ force: true });
      logger.info({ imageName }, 'Image removed');
      return true;
    } catch (error) {
      logger.warn({ imageName, error }, 'Failed to remove image');
      return false;
    }
  }

  // ===========================================
  // LIST IMAGES
  // ===========================================

  async listImages(projectId?: string): Promise<Docker.ImageInfo[]> {
    try {
      const images = await this.docker.listImages();
      
      if (projectId) {
        return images.filter(img => 
          img.RepoTags?.some(tag => tag.includes(`zyphron/${projectId}`))
        );
      }
      
      return images.filter(img =>
        img.RepoTags?.some(tag => tag.includes('zyphron/'))
      );
    } catch (error) {
      logger.error({ error }, 'Failed to list images');
      return [];
    }
  }

  // ===========================================
  // HELPERS
  // ===========================================

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async createTarStream(projectPath: string): Promise<NodeJS.ReadableStream> {
    const tarPath = `${projectPath}.tar`;
    
    await tar.create(
      {
        file: tarPath,
        cwd: projectPath,
        gzip: false,
      },
      ['.']
    );

    const stream = await import('node:fs').then(fs => fs.createReadStream(tarPath));
    
    // Clean up tar file after stream ends
    stream.on('end', () => {
      fs.unlink(tarPath).catch(() => {});
    });

    return stream;
  }

  private logMessage(message: string, onLog?: (log: string) => void): void {
    if (onLog) {
      onLog(message);
    }
  }

  // ===========================================
  // GET DOCKERFILE TEMPLATE
  // ===========================================

  getDockerfileTemplate(framework: string, detection: DetectionResult): string {
    const template = DOCKERFILE_TEMPLATES[framework] || DOCKERFILE_TEMPLATES.unknown;
    return template(detection);
  }
}

// ===========================================
// SINGLETON
// ===========================================

let builderServiceInstance: BuilderService | null = null;

export function getBuilderService(registryUrl?: string): BuilderService {
  if (!builderServiceInstance) {
    builderServiceInstance = new BuilderService(registryUrl);
  }
  return builderServiceInstance;
}

export default BuilderService;
