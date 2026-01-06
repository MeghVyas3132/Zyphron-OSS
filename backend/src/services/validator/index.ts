// ===========================================
// PROJECT VALIDATOR & AUTO-FIXER
// Detects and repairs common project issues before build
// ===========================================

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('project-validator');

// Helper to check if path exists
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Helper to ensure directory exists
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// Helper to read JSON file
async function readJson<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

// Import DetectionResult from detector to match the type used in deployer
import type { DetectionResult } from '../detector/index.js';

// Re-export detection type for convenience (alias for DetectionResult)
export type ProjectDetection = DetectionResult;

// Package.json structure for type safety
interface PackageJson {
  name?: string;
  version?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  fixes: AppliedFix[];
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  code: string;
  message: string;
  file?: string;
  autoFixable: boolean;
}

export interface AppliedFix {
  code: string;
  description: string;
  filesCreated: string[];
  filesModified: string[];
}

// ===========================================
// TEMPLATES FOR AUTO-GENERATION
// ===========================================

const TEMPLATES = {
  // Create React App templates
  CRA_INDEX_HTML: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Web application" />
    <title>App</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
`,

  CRA_INDEX_JS: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,

  CRA_INDEX_TSX: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,

  // Next.js templates
  NEXT_CONFIG: `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
`,

  // Basic Express health endpoint
  EXPRESS_HEALTH: `
// Health check endpoint (auto-added by Zyphron)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});
`,

  // Vite index.html
  VITE_INDEX_HTML: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,

  VITE_MAIN_JSX: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
};

// ===========================================
// VALIDATOR CLASS
// ===========================================

export class ProjectValidator {
  private projectPath: string;
  private detection: ProjectDetection;
  private issues: ValidationIssue[] = [];
  private fixes: AppliedFix[] = [];

  constructor(projectPath: string, detection: ProjectDetection) {
    this.projectPath = projectPath;
    this.detection = detection;
  }

  async validate(): Promise<ValidationResult> {
    this.issues = [];
    this.fixes = [];

    logger.info({ 
      path: this.projectPath, 
      framework: this.detection.framework,
      language: this.detection.language,
    }, 'Validating project structure');

    // Run framework-specific validations
    switch (this.detection.framework) {
      case 'react':
        await this.validateReact();
        break;
      case 'nextjs':
        await this.validateNext();
        break;
      case 'vue':
        await this.validateVue();
        break;
      // Vite is typically detected as 'react' or 'vue' with vite config
      case 'express':
        await this.validateExpress();
        break;
      case 'fastify':
        await this.validateFastify();
        break;
      case 'docker':
        // Even with existing Dockerfile, check if it's a known framework
        await this.validateDockerProject();
        break;
      default:
        await this.validateGeneric();
    }

    // Run language-specific validations
    switch (this.detection.language) {
      case 'javascript':
      case 'typescript':
        await this.validateNode();
        break;
      case 'python':
        await this.validatePython();
        break;
      case 'go':
        await this.validateGo();
        break;
    }

    const hasErrors = this.issues.some(i => i.type === 'error' && !i.autoFixable);
    
    return {
      valid: !hasErrors,
      issues: this.issues,
      fixes: this.fixes,
    };
  }

  // ===========================================
  // DOCKER PROJECT VALIDATION
  // Checks for framework-specific issues even when Dockerfile exists
  // ===========================================

  private async validateDockerProject(): Promise<void> {
    const packageJson = await this.readPackageJson();
    if (!packageJson) return;

    // Check if it's a Create React App project
    if (packageJson.dependencies?.['react-scripts'] || packageJson.devDependencies?.['react-scripts']) {
      logger.info({ path: this.projectPath }, 'Detected CRA project with existing Dockerfile, validating CRA structure');
      await this.validateCRA();
      return;
    }

    // Check if it's a Next.js project
    if (packageJson.dependencies?.['next'] || packageJson.devDependencies?.['next']) {
      logger.info({ path: this.projectPath }, 'Detected Next.js project with existing Dockerfile');
      await this.validateNext();
      return;
    }

    // Check if it's a Vite project
    if (packageJson.dependencies?.['vite'] || packageJson.devDependencies?.['vite']) {
      logger.info({ path: this.projectPath }, 'Detected Vite project with existing Dockerfile');
      await this.validateVite();
      return;
    }

    // Check if it's a Vue project
    if (packageJson.dependencies?.['vue']) {
      logger.info({ path: this.projectPath }, 'Detected Vue project with existing Dockerfile');
      await this.validateVue();
      return;
    }
  }

  // ===========================================
  // REACT VALIDATION (CRA)
  // ===========================================

  private async validateReact(): Promise<void> {
    const packageJson = await this.readPackageJson();
    if (!packageJson) return;

    // Check if it's Create React App
    const isCRA = packageJson.dependencies?.['react-scripts'] || 
                  packageJson.devDependencies?.['react-scripts'];

    if (isCRA) {
      await this.validateCRA();
    } else {
      // Custom React setup - check for bundler
      const hasWebpack = packageJson.dependencies?.webpack || packageJson.devDependencies?.webpack;
      const hasVite = packageJson.dependencies?.vite || packageJson.devDependencies?.vite;
      const hasParcel = packageJson.dependencies?.parcel || packageJson.devDependencies?.parcel;

      if (!hasWebpack && !hasVite && !hasParcel) {
        this.issues.push({
          type: 'warning',
          code: 'REACT_NO_BUNDLER',
          message: 'React project without a bundler detected. Consider adding Vite or Create React App.',
          autoFixable: false,
        });
      }
    }
  }

  private async validateCRA(): Promise<void> {
    // Check for public/index.html
    const publicIndexPath = path.join(this.projectPath, 'public', 'index.html');
    if (!await pathExists(publicIndexPath)) {
      this.issues.push({
        type: 'error',
        code: 'CRA_MISSING_PUBLIC_INDEX',
        message: 'Create React App requires public/index.html',
        file: 'public/index.html',
        autoFixable: true,
      });

      // Auto-fix: create the file
      await this.fixCRAPublicIndex();
    }

    // Check for src/index.js or src/index.tsx
    const srcIndexJs = path.join(this.projectPath, 'src', 'index.js');
    const srcIndexJsx = path.join(this.projectPath, 'src', 'index.jsx');
    const srcIndexTs = path.join(this.projectPath, 'src', 'index.ts');
    const srcIndexTsx = path.join(this.projectPath, 'src', 'index.tsx');

    const hasIndex = await pathExists(srcIndexJs) || 
                     await pathExists(srcIndexJsx) ||
                     await pathExists(srcIndexTs) || 
                     await pathExists(srcIndexTsx);

    if (!hasIndex) {
      // Check if there's an App component to render
      const hasApp = await pathExists(path.join(this.projectPath, 'src', 'App.js')) ||
                     await pathExists(path.join(this.projectPath, 'src', 'App.jsx')) ||
                     await pathExists(path.join(this.projectPath, 'src', 'App.tsx'));

      this.issues.push({
        type: 'error',
        code: 'CRA_MISSING_SRC_INDEX',
        message: 'Create React App requires src/index.js or src/index.tsx',
        file: 'src/index.js',
        autoFixable: hasApp, // Only auto-fixable if there's an App component
      });

      if (hasApp) {
        await this.fixCRASrcIndex();
      }
    }
  }

  private async fixCRAPublicIndex(): Promise<void> {
    const publicDir = path.join(this.projectPath, 'public');
    const indexPath = path.join(publicDir, 'index.html');

    await ensureDir(publicDir);
    await fs.writeFile(indexPath, TEMPLATES.CRA_INDEX_HTML);

    this.fixes.push({
      code: 'CRA_MISSING_PUBLIC_INDEX',
      description: 'Created public/index.html with standard CRA template',
      filesCreated: ['public/index.html'],
      filesModified: [],
    });

    logger.info({ path: indexPath }, 'Auto-created public/index.html for CRA');
  }

  private async fixCRASrcIndex(): Promise<void> {
    // Determine if project uses TypeScript
    const hasTsConfig = await pathExists(path.join(this.projectPath, 'tsconfig.json'));
    const hasAppTsx = await pathExists(path.join(this.projectPath, 'src', 'App.tsx'));

    const isTypeScript = hasTsConfig || hasAppTsx;
    const indexFile = isTypeScript ? 'index.tsx' : 'index.js';
    const template = isTypeScript ? TEMPLATES.CRA_INDEX_TSX : TEMPLATES.CRA_INDEX_JS;

    const indexPath = path.join(this.projectPath, 'src', indexFile);
    await fs.writeFile(indexPath, template);

    this.fixes.push({
      code: 'CRA_MISSING_SRC_INDEX',
      description: `Created src/${indexFile} to render App component`,
      filesCreated: [`src/${indexFile}`],
      filesModified: [],
    });

    logger.info({ path: indexPath }, `Auto-created src/${indexFile} for CRA`);
  }

  // ===========================================
  // VITE VALIDATION
  // ===========================================

  private async validateVite(): Promise<void> {
    // Check for index.html in root
    const indexPath = path.join(this.projectPath, 'index.html');
    if (!await pathExists(indexPath)) {
      this.issues.push({
        type: 'error',
        code: 'VITE_MISSING_INDEX',
        message: 'Vite requires index.html in project root',
        file: 'index.html',
        autoFixable: true,
      });

      await this.fixViteIndex();
    }

    // Check for src/main.jsx or src/main.tsx
    const mainJsx = path.join(this.projectPath, 'src', 'main.jsx');
    const mainTsx = path.join(this.projectPath, 'src', 'main.tsx');
    const mainJs = path.join(this.projectPath, 'src', 'main.js');
    const mainTs = path.join(this.projectPath, 'src', 'main.ts');

    const hasMain = await pathExists(mainJsx) ||
                    await pathExists(mainTsx) ||
                    await pathExists(mainJs) ||
                    await pathExists(mainTs);

    if (!hasMain) {
      const hasApp = await pathExists(path.join(this.projectPath, 'src', 'App.jsx')) ||
                     await pathExists(path.join(this.projectPath, 'src', 'App.tsx'));

      this.issues.push({
        type: 'error',
        code: 'VITE_MISSING_MAIN',
        message: 'Vite requires src/main.jsx or src/main.tsx',
        file: 'src/main.jsx',
        autoFixable: hasApp,
      });

      if (hasApp) {
        await this.fixViteMain();
      }
    }
  }

  private async fixViteIndex(): Promise<void> {
    const indexPath = path.join(this.projectPath, 'index.html');
    await fs.writeFile(indexPath, TEMPLATES.VITE_INDEX_HTML);

    this.fixes.push({
      code: 'VITE_MISSING_INDEX',
      description: 'Created index.html for Vite',
      filesCreated: ['index.html'],
      filesModified: [],
    });

    logger.info({ path: indexPath }, 'Auto-created index.html for Vite');
  }

  private async fixViteMain(): Promise<void> {
    const hasTsx = await pathExists(path.join(this.projectPath, 'src', 'App.tsx'));
    const mainFile = hasTsx ? 'main.tsx' : 'main.jsx';
    
    const mainPath = path.join(this.projectPath, 'src', mainFile);
    await fs.writeFile(mainPath, TEMPLATES.VITE_MAIN_JSX);

    this.fixes.push({
      code: 'VITE_MISSING_MAIN',
      description: `Created src/${mainFile} for Vite`,
      filesCreated: [`src/${mainFile}`],
      filesModified: [],
    });

    logger.info({ path: mainPath }, `Auto-created src/${mainFile} for Vite`);
  }

  // ===========================================
  // NEXT.JS VALIDATION
  // ===========================================

  private async validateNext(): Promise<void> {
    // Check for pages/ or app/ directory
    const pagesDir = path.join(this.projectPath, 'pages');
    const appDir = path.join(this.projectPath, 'app');
    const srcPagesDir = path.join(this.projectPath, 'src', 'pages');
    const srcAppDir = path.join(this.projectPath, 'src', 'app');

    const hasPages = await pathExists(pagesDir) || await pathExists(srcPagesDir);
    const hasApp = await pathExists(appDir) || await pathExists(srcAppDir);

    if (!hasPages && !hasApp) {
      this.issues.push({
        type: 'error',
        code: 'NEXT_MISSING_PAGES',
        message: 'Next.js requires pages/ or app/ directory',
        autoFixable: false,
      });
    }

    // Check for next.config.js
    const nextConfigJs = path.join(this.projectPath, 'next.config.js');
    const nextConfigMjs = path.join(this.projectPath, 'next.config.mjs');
    const nextConfigTs = path.join(this.projectPath, 'next.config.ts');

    const hasConfig = await pathExists(nextConfigJs) ||
                      await pathExists(nextConfigMjs) ||
                      await pathExists(nextConfigTs);

    if (!hasConfig) {
      this.issues.push({
        type: 'warning',
        code: 'NEXT_MISSING_CONFIG',
        message: 'No next.config.js found, using defaults',
        autoFixable: false,
      });
    }
  }

  // ===========================================
  // VUE VALIDATION
  // ===========================================

  private async validateVue(): Promise<void> {
    // Check for main entry point
    const mainJs = path.join(this.projectPath, 'src', 'main.js');
    const mainTs = path.join(this.projectPath, 'src', 'main.ts');

    const hasMain = await pathExists(mainJs) || await pathExists(mainTs);

    if (!hasMain) {
      this.issues.push({
        type: 'error',
        code: 'VUE_MISSING_MAIN',
        message: 'Vue project requires src/main.js or src/main.ts',
        file: 'src/main.js',
        autoFixable: false,
      });
    }

    // Check for index.html (Vite-based Vue)
    const indexPath = path.join(this.projectPath, 'index.html');
    const publicIndexPath = path.join(this.projectPath, 'public', 'index.html');

    if (!await pathExists(indexPath) && !await pathExists(publicIndexPath)) {
      this.issues.push({
        type: 'error',
        code: 'VUE_MISSING_INDEX',
        message: 'Vue project requires index.html',
        autoFixable: false,
      });
    }
  }

  // ===========================================
  // EXPRESS VALIDATION
  // ===========================================

  private async validateExpress(): Promise<void> {
    const packageJson = await this.readPackageJson();
    if (!packageJson) return;

    // Check for main entry point
    const mainFile = String(packageJson.main || 'index.js');
    const mainPath = path.join(this.projectPath, mainFile);

    if (!await pathExists(mainPath)) {
      // Check common alternatives
      const alternatives = ['server.js', 'app.js', 'src/index.js', 'src/server.js', 'src/app.js'];
      let foundAlt = false;

      for (const alt of alternatives) {
        if (await pathExists(path.join(this.projectPath, alt))) {
          this.issues.push({
            type: 'warning',
            code: 'EXPRESS_WRONG_MAIN',
            message: `Main entry point set to ${mainFile} but found ${alt}. Consider updating package.json`,
            file: 'package.json',
            autoFixable: false,
          });
          foundAlt = true;
          break;
        }
      }

      if (!foundAlt) {
        this.issues.push({
          type: 'error',
          code: 'EXPRESS_MISSING_ENTRY',
          message: `Main entry point ${mainFile} not found`,
          file: mainFile,
          autoFixable: false,
        });
      }
    }
  }

  // ===========================================
  // FASTIFY VALIDATION
  // ===========================================

  private async validateFastify(): Promise<void> {
    // Similar to Express
    await this.validateExpress();
  }

  // ===========================================
  // NODE.JS VALIDATION
  // ===========================================

  private async validateNode(): Promise<void> {
    const packageJson = await this.readPackageJson();
    if (!packageJson) {
      this.issues.push({
        type: 'error',
        code: 'NODE_MISSING_PACKAGE_JSON',
        message: 'Node.js project requires package.json',
        file: 'package.json',
        autoFixable: false,
      });
      return;
    }

    // Check for start script
    if (!packageJson.scripts?.start) {
      this.issues.push({
        type: 'warning',
        code: 'NODE_MISSING_START_SCRIPT',
        message: 'No start script in package.json, will try to use main entry point',
        file: 'package.json',
        autoFixable: false,
      });
    }

    // Check for node version
    if (packageJson.engines?.node) {
      const nodeVersion = packageJson.engines.node;
      logger.info({ nodeVersion }, 'Project specifies Node.js version');
    }
  }

  // ===========================================
  // PYTHON VALIDATION
  // ===========================================

  private async validatePython(): Promise<void> {
    // Check for requirements.txt or pyproject.toml
    const hasRequirements = await pathExists(path.join(this.projectPath, 'requirements.txt'));
    const hasPyproject = await pathExists(path.join(this.projectPath, 'pyproject.toml'));
    const hasPipfile = await pathExists(path.join(this.projectPath, 'Pipfile'));

    if (!hasRequirements && !hasPyproject && !hasPipfile) {
      this.issues.push({
        type: 'warning',
        code: 'PYTHON_NO_DEPS',
        message: 'No dependency file found (requirements.txt, pyproject.toml, or Pipfile)',
        autoFixable: false,
      });
    }

    // Check for main entry point
    const commonEntries = ['app.py', 'main.py', 'run.py', 'server.py', 'wsgi.py'];
    let foundEntry = false;

    for (const entry of commonEntries) {
      if (await pathExists(path.join(this.projectPath, entry))) {
        foundEntry = true;
        break;
      }
    }

    if (!foundEntry) {
      this.issues.push({
        type: 'warning',
        code: 'PYTHON_NO_ENTRY',
        message: 'No common entry point found (app.py, main.py, etc.)',
        autoFixable: false,
      });
    }
  }

  // ===========================================
  // GO VALIDATION
  // ===========================================

  private async validateGo(): Promise<void> {
    // Check for go.mod
    const hasGoMod = await pathExists(path.join(this.projectPath, 'go.mod'));

    if (!hasGoMod) {
      this.issues.push({
        type: 'error',
        code: 'GO_MISSING_MOD',
        message: 'Go project requires go.mod',
        file: 'go.mod',
        autoFixable: false,
      });
    }

    // Check for main.go
    const hasMainGo = await pathExists(path.join(this.projectPath, 'main.go'));
    const hasCmdMain = await pathExists(path.join(this.projectPath, 'cmd', 'main.go'));

    if (!hasMainGo && !hasCmdMain) {
      this.issues.push({
        type: 'warning',
        code: 'GO_NO_MAIN',
        message: 'No main.go found in root or cmd/ directory',
        autoFixable: false,
      });
    }
  }

  // ===========================================
  // GENERIC VALIDATION
  // ===========================================

  private async validateGeneric(): Promise<void> {
    // Check for Dockerfile
    const hasDockerfile = await pathExists(path.join(this.projectPath, 'Dockerfile'));

    if (!hasDockerfile) {
      this.issues.push({
        type: 'warning',
        code: 'NO_DOCKERFILE',
        message: 'No Dockerfile found, will be auto-generated',
        autoFixable: true,
      });
    }
  }

  // ===========================================
  // UTILITIES
  // ===========================================

  private async readPackageJson(): Promise<PackageJson | null> {
    const packagePath = path.join(this.projectPath, 'package.json');
    
    try {
      if (await pathExists(packagePath)) {
        return await readJson(packagePath) as PackageJson;
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to read package.json');
    }

    return null;
  }
}

// ===========================================
// EXPORTED FUNCTIONS
// ===========================================

export async function validateProject(
  projectPath: string,
  detection: ProjectDetection
): Promise<ValidationResult> {
  const validator = new ProjectValidator(projectPath, detection);
  return validator.validate();
}

export async function validateAndFix(
  projectPath: string,
  detection: ProjectDetection
): Promise<ValidationResult> {
  // validateProject already applies auto-fixes
  return validateProject(projectPath, detection);
}
