// ===========================================
// AI SERVICE
// AI-powered analysis for intelligent deployment decisions
// ===========================================

import { createLogger } from '../../lib/logger.js';
import { getRedisClient } from '../../lib/redis.js';

const logger = createLogger('ai-service');

// ===========================================
// TYPES
// ===========================================

export interface AIAnalysisResult {
  // Environment Detection
  detectedEnvironment: {
    framework: string;
    language: string;
    confidence: number;
    alternativeFrameworks: { name: string; confidence: number }[];
  };
  
  // Resource Recommendations
  resourceRecommendation: {
    cpu: string;
    memory: string;
    instances: number;
    scaling: {
      minInstances: number;
      maxInstances: number;
      targetCpuUtilization: number;
    };
    estimatedMonthlyCost: number;
  };
  
  // Build Optimization
  buildOptimization: {
    suggestedBuildCommand: string;
    suggestedStartCommand: string;
    cacheStrategy: string[];
    parallelizable: boolean;
    estimatedBuildTime: number; // seconds
  };
  
  // Security Analysis
  securityAnalysis: {
    vulnerabilityRisk: 'low' | 'medium' | 'high';
    recommendations: string[];
    outdatedDependencies: { name: string; current: string; latest: string }[];
  };
  
  // Performance Hints
  performanceHints: {
    suggestions: string[];
    optimizations: string[];
  };
}

export interface ProjectAnalysisInput {
  packageJson?: Record<string, unknown>;
  files: string[];
  languages: Record<string, number>; // language -> line count
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  hasDockerfile: boolean;
  hasTests: boolean;
  repoSize: number; // bytes
  commitCount?: number;
}

// ===========================================
// FRAMEWORK SIGNATURES
// ===========================================

interface FrameworkSignature {
  name: string;
  indicators: {
    dependencies: string[];
    devDependencies: string[];
    files: string[];
    scripts: string[];
    configFiles: string[];
  };
  weight: number;
  resourceProfile: 'light' | 'medium' | 'heavy';
  defaultPort: number;
  buildTime: number; // estimated seconds
}

const FRAMEWORK_SIGNATURES: FrameworkSignature[] = [
  {
    name: 'nextjs',
    indicators: {
      dependencies: ['next', 'react', 'react-dom'],
      devDependencies: ['@types/react', 'eslint-config-next'],
      files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
      scripts: ['next build', 'next start', 'next dev'],
      configFiles: ['next.config.js', 'next.config.mjs'],
    },
    weight: 100,
    resourceProfile: 'medium',
    defaultPort: 3000,
    buildTime: 120,
  },
  {
    name: 'react',
    indicators: {
      dependencies: ['react', 'react-dom'],
      devDependencies: ['@types/react', 'vite', 'react-scripts'],
      files: ['src/App.tsx', 'src/App.jsx', 'src/index.tsx'],
      scripts: ['react-scripts', 'vite build'],
      configFiles: ['vite.config.ts', 'vite.config.js'],
    },
    weight: 80,
    resourceProfile: 'light',
    defaultPort: 3000,
    buildTime: 60,
  },
  {
    name: 'vue',
    indicators: {
      dependencies: ['vue'],
      devDependencies: ['@vue/cli-service', 'vite', '@vitejs/plugin-vue'],
      files: ['src/App.vue', 'src/main.ts', 'src/main.js'],
      scripts: ['vue-cli-service', 'vite build'],
      configFiles: ['vue.config.js', 'vite.config.ts'],
    },
    weight: 80,
    resourceProfile: 'light',
    defaultPort: 8080,
    buildTime: 60,
  },
  {
    name: 'nuxt',
    indicators: {
      dependencies: ['nuxt'],
      devDependencies: ['@nuxt/types'],
      files: ['nuxt.config.ts', 'nuxt.config.js'],
      scripts: ['nuxt build', 'nuxt generate'],
      configFiles: ['nuxt.config.ts', 'nuxt.config.js'],
    },
    weight: 90,
    resourceProfile: 'medium',
    defaultPort: 3000,
    buildTime: 90,
  },
  {
    name: 'svelte',
    indicators: {
      dependencies: ['svelte'],
      devDependencies: ['@sveltejs/kit', 'svelte-check'],
      files: ['svelte.config.js', 'src/routes'],
      scripts: ['svelte-kit build', 'vite build'],
      configFiles: ['svelte.config.js'],
    },
    weight: 85,
    resourceProfile: 'light',
    defaultPort: 5173,
    buildTime: 45,
  },
  {
    name: 'express',
    indicators: {
      dependencies: ['express'],
      devDependencies: ['@types/express', 'nodemon'],
      files: ['server.js', 'app.js', 'index.js', 'src/server.ts'],
      scripts: ['node server', 'nodemon'],
      configFiles: [],
    },
    weight: 70,
    resourceProfile: 'light',
    defaultPort: 3000,
    buildTime: 30,
  },
  {
    name: 'fastify',
    indicators: {
      dependencies: ['fastify'],
      devDependencies: ['@types/node', 'typescript'],
      files: ['src/app.ts', 'src/index.ts'],
      scripts: ['fastify start'],
      configFiles: [],
    },
    weight: 70,
    resourceProfile: 'light',
    defaultPort: 3000,
    buildTime: 30,
  },
  {
    name: 'nestjs',
    indicators: {
      dependencies: ['@nestjs/core', '@nestjs/common'],
      devDependencies: ['@nestjs/cli', '@nestjs/testing'],
      files: ['nest-cli.json', 'src/main.ts', 'src/app.module.ts'],
      scripts: ['nest build', 'nest start'],
      configFiles: ['nest-cli.json'],
    },
    weight: 85,
    resourceProfile: 'medium',
    defaultPort: 3000,
    buildTime: 60,
  },
  {
    name: 'django',
    indicators: {
      dependencies: ['django'],
      devDependencies: [],
      files: ['manage.py', 'settings.py', 'wsgi.py'],
      scripts: ['python manage.py'],
      configFiles: ['settings.py'],
    },
    weight: 90,
    resourceProfile: 'medium',
    defaultPort: 8000,
    buildTime: 20,
  },
  {
    name: 'fastapi',
    indicators: {
      dependencies: ['fastapi', 'uvicorn'],
      devDependencies: ['pytest'],
      files: ['main.py', 'app/main.py'],
      scripts: ['uvicorn'],
      configFiles: [],
    },
    weight: 85,
    resourceProfile: 'light',
    defaultPort: 8000,
    buildTime: 15,
  },
  {
    name: 'flask',
    indicators: {
      dependencies: ['flask'],
      devDependencies: [],
      files: ['app.py', 'application.py', 'wsgi.py'],
      scripts: ['flask run', 'gunicorn'],
      configFiles: [],
    },
    weight: 75,
    resourceProfile: 'light',
    defaultPort: 5000,
    buildTime: 15,
  },
  {
    name: 'rails',
    indicators: {
      dependencies: ['rails'],
      devDependencies: [],
      files: ['Gemfile', 'config/routes.rb', 'app/controllers'],
      scripts: ['rails server', 'puma'],
      configFiles: ['config/application.rb'],
    },
    weight: 85,
    resourceProfile: 'heavy',
    defaultPort: 3000,
    buildTime: 90,
  },
  {
    name: 'go',
    indicators: {
      dependencies: [],
      devDependencies: [],
      files: ['go.mod', 'go.sum', 'main.go'],
      scripts: ['go build', 'go run'],
      configFiles: ['go.mod'],
    },
    weight: 80,
    resourceProfile: 'light',
    defaultPort: 8080,
    buildTime: 30,
  },
  {
    name: 'rust',
    indicators: {
      dependencies: [],
      devDependencies: [],
      files: ['Cargo.toml', 'Cargo.lock', 'src/main.rs'],
      scripts: ['cargo build', 'cargo run'],
      configFiles: ['Cargo.toml'],
    },
    weight: 80,
    resourceProfile: 'light',
    defaultPort: 8080,
    buildTime: 120,
  },
];

// ===========================================
// RESOURCE PROFILES
// ===========================================

const RESOURCE_PROFILES = {
  light: {
    cpu: '0.25',
    memory: '256Mi',
    instances: 1,
    scaling: { minInstances: 1, maxInstances: 3, targetCpuUtilization: 70 },
    monthlyCost: 5,
  },
  medium: {
    cpu: '0.5',
    memory: '512Mi',
    instances: 1,
    scaling: { minInstances: 1, maxInstances: 5, targetCpuUtilization: 70 },
    monthlyCost: 15,
  },
  heavy: {
    cpu: '1',
    memory: '1Gi',
    instances: 2,
    scaling: { minInstances: 2, maxInstances: 10, targetCpuUtilization: 60 },
    monthlyCost: 40,
  },
};

// ===========================================
// AI ANALYSIS ENGINE
// ===========================================

export class AIAnalysisEngine {
  private redis = getRedisClient();

  /**
   * Analyze a project and provide AI-powered recommendations
   */
  async analyzeProject(input: ProjectAnalysisInput): Promise<AIAnalysisResult> {
    const cacheKey = this.getCacheKey(input);
    
    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Returning cached AI analysis');
      return JSON.parse(cached);
    }

    logger.info('Starting AI project analysis');

    // Detect framework
    const detectedEnvironment = this.detectFramework(input);
    
    // Get resource recommendation
    const resourceRecommendation = this.getResourceRecommendation(
      detectedEnvironment.framework,
      input
    );
    
    // Build optimization
    const buildOptimization = this.getBuildOptimization(
      detectedEnvironment.framework,
      input
    );
    
    // Security analysis
    const securityAnalysis = await this.analyzeSecuriy(input);
    
    // Performance hints
    const performanceHints = this.getPerformanceHints(
      detectedEnvironment.framework,
      input
    );

    const result: AIAnalysisResult = {
      detectedEnvironment,
      resourceRecommendation,
      buildOptimization,
      securityAnalysis,
      performanceHints,
    };

    // Cache result for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(result));

    logger.info({ framework: detectedEnvironment.framework }, 'AI analysis complete');
    return result;
  }

  /**
   * Detect framework using weighted scoring
   */
  private detectFramework(input: ProjectAnalysisInput): AIAnalysisResult['detectedEnvironment'] {
    const scores: Map<string, number> = new Map();
    const deps = input.dependencies || {};
    const devDeps = input.devDependencies || {};
    const allDeps = { ...deps, ...devDeps };
    const scripts = (input.packageJson?.scripts as Record<string, string>) || {};

    for (const signature of FRAMEWORK_SIGNATURES) {
      let score = 0;

      // Check dependencies (highest weight)
      for (const dep of signature.indicators.dependencies) {
        if (allDeps[dep]) {
          score += 30;
        }
      }

      // Check dev dependencies
      for (const dep of signature.indicators.devDependencies) {
        if (devDeps[dep]) {
          score += 15;
        }
      }

      // Check files
      for (const file of signature.indicators.files) {
        if (input.files.some(f => f.includes(file) || f.endsWith(file))) {
          score += 20;
        }
      }

      // Check config files
      for (const config of signature.indicators.configFiles) {
        if (input.files.some(f => f.endsWith(config))) {
          score += 25;
        }
      }

      // Check scripts
      for (const script of signature.indicators.scripts) {
        if (Object.values(scripts).some(s => s.includes(script))) {
          score += 10;
        }
      }

      // Apply framework weight
      score = (score * signature.weight) / 100;

      if (score > 0) {
        scores.set(signature.name, score);
      }
    }

    // Sort by score
    const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
      return {
        framework: 'unknown',
        language: this.detectLanguage(input),
        confidence: 0,
        alternativeFrameworks: [],
      };
    }

    const topFramework = sorted[0];
    const maxScore = Math.max(...sorted.map(s => s[1]));
    const confidence = Math.min(100, Math.round((topFramework[1] / maxScore) * 100));

    return {
      framework: topFramework[0],
      language: this.detectLanguage(input),
      confidence,
      alternativeFrameworks: sorted.slice(1, 4).map(([name, score]) => ({
        name,
        confidence: Math.round((score / maxScore) * 100),
      })),
    };
  }

  /**
   * Detect primary language
   */
  private detectLanguage(input: ProjectAnalysisInput): string {
    const languages = input.languages || {};
    const sorted = Object.entries(languages).sort((a, b) => b[1] - a[1]);
    
    if (sorted.length === 0) {
      // Infer from dependencies
      if (input.dependencies?.['typescript'] || input.files.some(f => f.endsWith('.ts'))) {
        return 'typescript';
      }
      if (input.files.some(f => f.endsWith('.py'))) {
        return 'python';
      }
      if (input.files.some(f => f.endsWith('.go'))) {
        return 'go';
      }
      if (input.files.some(f => f.endsWith('.rs'))) {
        return 'rust';
      }
      if (input.files.some(f => f.endsWith('.rb'))) {
        return 'ruby';
      }
      return 'javascript';
    }

    return sorted[0][0].toLowerCase();
  }

  /**
   * Get resource recommendations based on framework and project size
   */
  private getResourceRecommendation(
    framework: string,
    input: ProjectAnalysisInput
  ): AIAnalysisResult['resourceRecommendation'] {
    const signature = FRAMEWORK_SIGNATURES.find(s => s.name === framework);
    const profile = signature?.resourceProfile || 'medium';
    const baseResources = RESOURCE_PROFILES[profile];

    // Adjust based on project size
    const sizeMB = input.repoSize / (1024 * 1024);
    let sizeMultiplier = 1;
    if (sizeMB > 100) sizeMultiplier = 1.5;
    if (sizeMB > 500) sizeMultiplier = 2;

    // Adjust based on dependencies
    const depCount = Object.keys(input.dependencies || {}).length;
    let depMultiplier = 1;
    if (depCount > 50) depMultiplier = 1.25;
    if (depCount > 100) depMultiplier = 1.5;

    const multiplier = Math.max(sizeMultiplier, depMultiplier);

    return {
      cpu: this.scaleCPU(baseResources.cpu, multiplier),
      memory: this.scaleMemory(baseResources.memory, multiplier),
      instances: baseResources.instances,
      scaling: baseResources.scaling,
      estimatedMonthlyCost: Math.round(baseResources.monthlyCost * multiplier),
    };
  }

  /**
   * Get build optimization suggestions
   */
  private getBuildOptimization(
    framework: string,
    input: ProjectAnalysisInput
  ): AIAnalysisResult['buildOptimization'] {
    const signature = FRAMEWORK_SIGNATURES.find(s => s.name === framework);
    const scripts = (input.packageJson?.scripts as Record<string, string>) || {};

    // Determine package manager
    const hasPnpm = input.files.some(f => f.includes('pnpm-lock.yaml'));
    const hasYarn = input.files.some(f => f.includes('yarn.lock'));
    const hasBun = input.files.some(f => f.includes('bun.lockb'));

    let installPrefix = 'npm';
    if (hasPnpm) installPrefix = 'pnpm';
    else if (hasYarn) installPrefix = 'yarn';
    else if (hasBun) installPrefix = 'bun';

    // Build command
    let buildCommand = scripts.build || `${installPrefix} run build`;
    let startCommand = scripts.start || `${installPrefix} start`;

    // Framework-specific optimizations
    const cacheStrategy: string[] = ['node_modules'];

    switch (framework) {
      case 'nextjs':
        cacheStrategy.push('.next/cache');
        buildCommand = scripts.build || 'next build';
        startCommand = scripts.start || 'next start';
        break;
      case 'react':
        cacheStrategy.push('node_modules/.cache');
        break;
      case 'vue':
      case 'nuxt':
        cacheStrategy.push('.nuxt', 'node_modules/.cache');
        break;
      case 'django':
      case 'flask':
      case 'fastapi':
        cacheStrategy.length = 0;
        cacheStrategy.push('__pycache__', '.venv');
        buildCommand = 'pip install -r requirements.txt';
        startCommand = framework === 'django' 
          ? 'gunicorn config.wsgi:application'
          : 'uvicorn main:app --host 0.0.0.0';
        break;
      case 'go':
        cacheStrategy.length = 0;
        cacheStrategy.push('/go/pkg/mod');
        buildCommand = 'go build -o app .';
        startCommand = './app';
        break;
      case 'rust':
        cacheStrategy.length = 0;
        cacheStrategy.push('target', '/usr/local/cargo/registry');
        buildCommand = 'cargo build --release';
        startCommand = './target/release/app';
        break;
    }

    return {
      suggestedBuildCommand: buildCommand,
      suggestedStartCommand: startCommand,
      cacheStrategy,
      parallelizable: ['nextjs', 'react', 'vue'].includes(framework),
      estimatedBuildTime: signature?.buildTime || 60,
    };
  }

  /**
   * Analyze security vulnerabilities
   */
  private async analyzeSecuriy(
    input: ProjectAnalysisInput
  ): Promise<AIAnalysisResult['securityAnalysis']> {
    const recommendations: string[] = [];
    const outdatedDependencies: { name: string; current: string; latest: string }[] = [];

    // Check for common security issues
    const deps = { ...input.dependencies, ...input.devDependencies };

    // Known vulnerable packages (simplified check)
    const vulnerablePatterns = [
      { pattern: /^lodash$/, minVersion: '4.17.21', message: 'Update lodash to 4.17.21+' },
      { pattern: /^axios$/, minVersion: '1.6.0', message: 'Update axios to 1.6.0+' },
      { pattern: /^express$/, minVersion: '4.19.0', message: 'Update express to 4.19.0+' },
    ];

    for (const [pkg, version] of Object.entries(deps)) {
      for (const vuln of vulnerablePatterns) {
        if (vuln.pattern.test(pkg)) {
          const cleanVersion = version.replace(/[\^~]/, '');
          if (this.compareVersions(cleanVersion, vuln.minVersion) < 0) {
            recommendations.push(vuln.message);
            outdatedDependencies.push({
              name: pkg,
              current: cleanVersion,
              latest: vuln.minVersion,
            });
          }
        }
      }
    }

    // General recommendations
    if (!input.files.some(f => f.includes('.env.example'))) {
      recommendations.push('Add .env.example to document required environment variables');
    }
    if (!input.files.some(f => f.includes('.gitignore'))) {
      recommendations.push('Add .gitignore to prevent committing sensitive files');
    }
    if (input.files.some(f => f.includes('.env') && !f.includes('.example'))) {
      recommendations.push('Ensure .env files are not committed to repository');
    }

    const risk: 'low' | 'medium' | 'high' = 
      outdatedDependencies.length > 5 ? 'high' :
      outdatedDependencies.length > 2 ? 'medium' : 'low';

    return {
      vulnerabilityRisk: risk,
      recommendations,
      outdatedDependencies,
    };
  }

  /**
   * Get performance optimization hints
   */
  private getPerformanceHints(
    framework: string,
    input: ProjectAnalysisInput
  ): AIAnalysisResult['performanceHints'] {
    const suggestions: string[] = [];
    const optimizations: string[] = [];

    const deps = input.dependencies || {};

    // Framework-specific hints
    switch (framework) {
      case 'nextjs':
        if (!deps['sharp']) {
          suggestions.push('Install sharp for optimized image processing');
        }
        optimizations.push('Enable static page generation where possible');
        optimizations.push('Use next/image for automatic image optimization');
        break;
      case 'react':
        if (!deps['react-query'] && !deps['@tanstack/react-query'] && !deps['swr']) {
          suggestions.push('Consider using React Query or SWR for data fetching');
        }
        optimizations.push('Use React.lazy() for code splitting');
        break;
      case 'express':
      case 'fastify':
        if (!deps['compression']) {
          suggestions.push('Add compression middleware for response compression');
        }
        if (!deps['helmet']) {
          suggestions.push('Add helmet for security headers');
        }
        break;
      case 'django':
        optimizations.push('Enable Django caching with Redis');
        optimizations.push('Use select_related/prefetch_related for query optimization');
        break;
    }

    // General hints
    if (Object.keys(deps).length > 50) {
      suggestions.push('Consider reducing dependencies to improve build times');
    }

    if (!input.hasDockerfile) {
      optimizations.push('Dockerfile will be auto-generated with multi-stage builds');
    }

    return { suggestions, optimizations };
  }

  // ===========================================
  // HELPER METHODS
  // ===========================================

  private getCacheKey(input: ProjectAnalysisInput): string {
    const hash = JSON.stringify({
      deps: Object.keys(input.dependencies || {}).sort(),
      files: input.files.slice(0, 20).sort(),
      size: input.repoSize,
    });
    return `ai:analysis:${Buffer.from(hash).toString('base64').slice(0, 32)}`;
  }

  private scaleCPU(base: string, multiplier: number): string {
    const value = parseFloat(base);
    return (value * multiplier).toFixed(2);
  }

  private scaleMemory(base: string, multiplier: number): string {
    const match = base.match(/^(\d+)(Mi|Gi)$/);
    if (!match) return base;
    const value = parseInt(match[1]);
    const unit = match[2];
    const scaled = Math.round(value * multiplier);
    if (unit === 'Mi' && scaled >= 1024) {
      return `${(scaled / 1024).toFixed(1)}Gi`;
    }
    return `${scaled}${unit}`;
  }

  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const diff = (partsA[i] || 0) - (partsB[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }
}

// Export singleton
export const aiEngine = new AIAnalysisEngine();
