// ===========================================
// AI SERVICE — Groq with key rotation
// Build error analysis, ENV suggestions, stack advice
// ===========================================

import Groq from 'groq-sdk';
import { groqRotator } from '@/lib/key-rotator.js';
import { createLogger } from '@/lib/logger.js';
import { config } from '@/config/index.js';
import { scanEnvVars, type EnvVar } from '@/services/env-scanner/index.js';

const logger = createLogger('ai-service');

// ===========================================
// GROQ CALL HELPER
// ===========================================

async function callGroq(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts?: { json?: boolean; maxTokens?: number }
): Promise<string> {
  if (!groqRotator.available) {
    throw new Error('Groq API not configured — add GROQ_API_KEYS to .env');
  }

  return groqRotator.withRotation(async (key) => {
    const groq = new Groq({ apiKey: key });

    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      messages,
      max_tokens: opts?.maxTokens ?? 1024,
      temperature: 0.2,
      ...(opts?.json ? { response_format: { type: 'json_object' } } : {}),
    });

    return completion.choices[0]?.message?.content ?? '';
  });
}

// ===========================================
// BUILD ERROR ANALYSIS
// ===========================================

export interface BuildErrorAnalysis {
  errorType: string;
  cause: string;
  fix: string;
  envVarsMissing: string[];
  packagesMissing: string[];
  confidence: number;
}

export async function analyzeBuildError(
  buildLogs: string,
  framework: string,
  language: string
): Promise<BuildErrorAnalysis> {
  const truncatedLogs = buildLogs.slice(-4000); // last 4k chars

  try {
    const response = await callGroq([
      {
        role: 'system',
        content: `You are a senior DevOps engineer analyzing build failures.
Respond ONLY with valid JSON matching this exact schema:
{
  "errorType": "string (e.g. missing dependency, env var not set, build command failed, port conflict)",
  "cause": "string (1-2 sentences explaining root cause)",
  "fix": "string (step-by-step actionable fix, be specific)",
  "envVarsMissing": ["VAR_NAME_1", "VAR_NAME_2"],
  "packagesMissing": ["package-name"],
  "confidence": 0-100
}`,
      },
      {
        role: 'user',
        content: `Framework: ${framework}\nLanguage: ${language}\n\nBuild logs (last portion):\n\`\`\`\n${truncatedLogs}\n\`\`\``,
      },
    ], { json: true });

    const parsed = JSON.parse(response) as BuildErrorAnalysis;
    return {
      errorType: parsed.errorType || 'Unknown error',
      cause: parsed.cause || 'Could not determine cause',
      fix: parsed.fix || 'Check build logs for details',
      envVarsMissing: Array.isArray(parsed.envVarsMissing) ? parsed.envVarsMissing : [],
      packagesMissing: Array.isArray(parsed.packagesMissing) ? parsed.packagesMissing : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
    };
  } catch (error) {
    logger.warn({ error }, 'Groq build analysis failed — falling back to regex');
    return fallbackBuildErrorAnalysis(buildLogs);
  }
}

// Regex fallback when Groq is unavailable
function fallbackBuildErrorAnalysis(logs: string): BuildErrorAnalysis {
  const missing = [...logs.matchAll(/Cannot find module '([^']+)'/g)].map((m) => m[1]);
  const envMissing = [...logs.matchAll(/(?:process\.env\.|missing env(?:ironment)? var(?:iable)?[: ]+)([A-Z_][A-Z0-9_]+)/gi)].map((m) => m[1]);

  if (missing.length > 0) {
    return {
      errorType: 'Missing dependency',
      cause: `Module(s) not found: ${missing.slice(0, 3).join(', ')}`,
      fix: `Run: npm install ${missing.slice(0, 3).join(' ')}\nCheck your package.json dependencies.`,
      envVarsMissing: envMissing,
      packagesMissing: missing.slice(0, 5),
      confidence: 85,
    };
  }

  if (logs.toLowerCase().includes('enoent')) {
    return {
      errorType: 'File not found',
      cause: 'A required file or directory is missing',
      fix: 'Verify your build command and output directory configuration.',
      envVarsMissing: envMissing,
      packagesMissing: [],
      confidence: 60,
    };
  }

  return {
    errorType: 'Build failed',
    cause: 'Build process exited with non-zero code',
    fix: 'Check the full build logs above for the specific error. Common fixes: (1) verify all env vars are set, (2) check build command, (3) ensure package.json scripts are correct.',
    envVarsMissing: envMissing,
    packagesMissing: [],
    confidence: 30,
  };
}

// ===========================================
// SMART ENV SUGGESTIONS
// Enriches raw scan results with AI-powered descriptions
// ===========================================

export interface EnvSuggestion extends EnvVar {
  aiDescription?: string;
  aiExample?: string;
  category?: string;
}

export async function enrichEnvSuggestions(
  vars: EnvVar[],
  framework: string,
  repoUrl: string
): Promise<EnvSuggestion[]> {
  if (!groqRotator.available || vars.length === 0) return vars;

  const varList = vars.map((v) => v.name).join(', ');

  try {
    const response = await callGroq([
      {
        role: 'system',
        content: `You are an expert developer. Given a list of environment variable names from a ${framework} project,
return a JSON object where each key is the variable name and the value is an object with:
- "description": short description (max 12 words)
- "example": realistic example value (not "your-key-here" — use actual format)
- "category": one of: database, auth, storage, payment, email, ai, infra, api, other`,
      },
      {
        role: 'user',
        content: `Repository: ${repoUrl}\nFramework: ${framework}\nVars: ${varList}`,
      },
    ], { json: true, maxTokens: 1500 });

    const enrichments = JSON.parse(response) as Record<string, { description?: string; example?: string; category?: string }>;

    return vars.map((v) => {
      const e = enrichments[v.name];
      return {
        ...v,
        aiDescription: e?.description || v.purpose,
        aiExample: e?.example || v.example,
        category: e?.category || 'other',
      };
    });
  } catch (error) {
    logger.warn({ error }, 'Groq env enrichment failed — using regex results');
    return vars;
  }
}

// ===========================================
// DEPLOYMENT ADVICE
// ===========================================

export interface DeploymentAdvice {
  resourceCpu: string;
  resourceMemory: string;
  scaling: { min: number; max: number };
  suggestions: string[];
  estimatedCostFree: boolean;
}

export async function getDeploymentAdvice(
  framework: string,
  language: string,
  repoSize: number,
  hasDatabase: boolean
): Promise<DeploymentAdvice> {
  try {
    const response = await callGroq([
      {
        role: 'system',
        content: `You are a cloud infrastructure expert. Recommend optimal container resources for a deployment.
Respond with JSON:
{
  "resourceCpu": "0.5",
  "resourceMemory": "512m",
  "scaling": { "min": 1, "max": 3 },
  "suggestions": ["tip 1", "tip 2"],
  "estimatedCostFree": true
}`,
      },
      {
        role: 'user',
        content: `Framework: ${framework}, Language: ${language}, Repo size: ${Math.round(repoSize / 1024)}KB, Has database: ${hasDatabase}`,
      },
    ], { json: true, maxTokens: 512 });

    return JSON.parse(response) as DeploymentAdvice;
  } catch {
    return {
      resourceCpu: '0.5',
      resourceMemory: '512m',
      scaling: { min: 1, max: 3 },
      suggestions: ['Use environment variables for all secrets', 'Add a /health endpoint for health checks'],
      estimatedCostFree: true,
    };
  }
}

// ===========================================
// RE-EXPORT env scanner for convenience
// ===========================================
export { scanEnvVars };

// ===========================================
// COMPAT SHIM — aiEngine object used by routes/ai.ts
// wraps the new function-based API into an object interface.
// ===========================================

export const aiEngine = {
  async analyzeProject(input: {
    packageJson?: Record<string, unknown>;
    files: string[];
    languages: Record<string, number>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    hasDockerfile: boolean;
    hasTests: boolean;
    repoSize: number;
  }) {
    const dominantLang = Object.entries(input.languages)
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'javascript';

    const pkg = input.packageJson as Record<string, unknown> | undefined;
    const deps = { ...input.dependencies, ...input.devDependencies };

    let framework = 'node';
    if (deps['next']) framework = 'nextjs';
    else if (deps['react']) framework = 'react';
    else if (deps['vue']) framework = 'vue';
    else if (deps['@nestjs/core']) framework = 'nestjs';
    else if (deps['fastify']) framework = 'fastify';
    else if (deps['express']) framework = 'express';
    else if (input.files.some(f => f.endsWith('.py'))) framework = 'python';
    else if (input.files.some(f => f.endsWith('.go'))) framework = 'go';

    const advice = await getDeploymentAdvice(
      framework,
      dominantLang,
      input.repoSize,
      Object.keys(deps).some(d => ['mongoose', 'pg', 'mysql2', 'prisma', 'typeorm', 'sequelize'].includes(d))
    );

    return {
      framework,
      language: dominantLang,
      packageManager: pkg?.packageManager as string || (deps['pnpm'] ? 'pnpm' : deps['yarn'] ? 'yarn' : 'npm'),
      hasDockerfile: input.hasDockerfile,
      hasTests: input.hasTests,
      advice,
    };
  },
};
