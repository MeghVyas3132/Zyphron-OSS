// ===========================================
// ENV SCANNER — detects required env vars from source code
// Supports: JS/TS, Python, Go, Ruby, PHP, Java, Rust, .NET, Elixir
// ===========================================

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createLogger } from '@/lib/logger.js';

const logger = createLogger('env-scanner');

export interface EnvVar {
  name: string;
  required: boolean;
  hasDefault: boolean;
  sources: string[];         // files where it was found
  purpose?: string;          // inferred purpose
  example?: string;          // example value hint
}

export interface ScanResult {
  vars: EnvVar[];
  hasEnvExample: boolean;
  exampleFilePath?: string;
}

// ===========================================
// LANGUAGE-SPECIFIC PATTERNS
// ===========================================

const PATTERNS = [
  // JS/TS — process.env.VAR_NAME and import.meta.env.VAR_NAME (Vite)
  { regex: /(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]{1,60})/g, lang: 'js/ts' },
  // JS/TS — process.env['VAR'] and process.env["VAR"]
  { regex: /(?:process\.env)\[['"]([A-Z][A-Z0-9_]{1,60})['"]\]/g, lang: 'js/ts' },
  // Python — os.environ['VAR'], os.environ.get('VAR'), os.getenv('VAR')
  { regex: /os\.(?:environ(?:\.get)?\(['"]|getenv\(['")])([A-Z][A-Z0-9_]{1,60})['"]/g, lang: 'python' },
  // Go — os.Getenv("VAR")
  { regex: /os\.Getenv\(["']([A-Z][A-Z0-9_]{1,60})["']\)/g, lang: 'go' },
  // Ruby — ENV['VAR'], ENV["VAR"], ENV.fetch('VAR')
  { regex: /ENV(?:\[['"]|\.fetch\(['"]])([A-Z][A-Z0-9_]{1,60})['"]/g, lang: 'ruby' },
  // PHP — $_ENV['VAR'], getenv('VAR'), $_SERVER['VAR']
  { regex: /(?:\$_ENV|\$_SERVER)\[['"]([A-Z][A-Z0-9_]{1,60})['"]\]/g, lang: 'php' },
  { regex: /getenv\(['"]((?:[A-Z])[A-Z0-9_]{1,60})['"]\)/g, lang: 'php' },
  // Java — System.getenv("VAR")
  { regex: /System\.getenv\(["']([A-Z][A-Z0-9_]{1,60})["']\)/g, lang: 'java' },
  // Rust — env::var("VAR"), std::env::var("VAR")
  { regex: /env::var\(["']([A-Z][A-Z0-9_]{1,60})["']\)/g, lang: 'rust' },
  // Elixir — System.get_env("VAR")
  { regex: /System\.get_env\(["']([A-Z][A-Z0-9_]{1,60})["']\)/g, lang: 'elixir' },
  // .NET — Environment.GetEnvironmentVariable("VAR")
  { regex: /Environment\.GetEnvironmentVariable\(["']([A-Z][A-Z0-9_]{1,60})["']\)/g, lang: 'dotnet' },
  // Docker-compose / shell — ${VAR} and $VAR in yaml/sh
  { regex: /\$\{([A-Z][A-Z0-9_]{1,60})\}/g, lang: 'shell' },
];

// Known vars to skip (noise)
const SKIP_VARS = new Set([
  'PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'PWD', 'TMPDIR', 'LANG',
  'NODE_ENV', 'PORT', 'HOST', 'CI', 'DEBUG', 'TZ',
]);

// Purpose inference rules
const PURPOSE_HINTS: Array<{ pattern: RegExp; purpose: string; example: string }> = [
  { pattern: /DATABASE_URL|DB_URL|DATABASE_CONNECTION/i, purpose: 'PostgreSQL/MySQL connection string', example: 'postgresql://user:pass@host:5432/db' },
  { pattern: /MONGO(?:DB)?_URI|MONGODB_URL/i, purpose: 'MongoDB connection string', example: 'mongodb://user:pass@host:27017/db' },
  { pattern: /REDIS_URL|REDIS_URI/i, purpose: 'Redis connection string', example: 'redis://localhost:6379' },
  { pattern: /JWT_SECRET|JWT_KEY/i, purpose: 'JWT signing secret (min 32 chars)', example: 'your-super-secret-jwt-key-32chars' },
  { pattern: /SECRET_KEY|APP_SECRET|SESSION_SECRET/i, purpose: 'Application secret key', example: 'random-secure-string-min-32-chars' },
  { pattern: /API_KEY|APIKEY/i, purpose: 'External API key', example: 'your-api-key' },
  { pattern: /STRIPE_/i, purpose: 'Stripe payment key', example: 'sk_live_...' },
  { pattern: /SENDGRID_|MAILGUN_|SMTP_/i, purpose: 'Email service credential', example: 'your-email-api-key' },
  { pattern: /AWS_ACCESS_KEY/i, purpose: 'AWS access key ID', example: 'AKIAIOSFODNN7EXAMPLE' },
  { pattern: /AWS_SECRET/i, purpose: 'AWS secret access key', example: 'your-aws-secret' },
  { pattern: /AWS_REGION/i, purpose: 'AWS region', example: 'us-east-1' },
  { pattern: /S3_BUCKET|AWS_BUCKET/i, purpose: 'AWS S3 bucket name', example: 'my-app-bucket' },
  { pattern: /OPENAI_API_KEY|ANTHROPIC_API_KEY|GROQ_API_KEY/i, purpose: 'AI service API key', example: 'sk-...' },
  { pattern: /GOOGLE_CLIENT_ID/i, purpose: 'Google OAuth client ID', example: 'xxx.apps.googleusercontent.com' },
  { pattern: /GOOGLE_CLIENT_SECRET/i, purpose: 'Google OAuth client secret', example: 'GOCSPX-...' },
  { pattern: /GITHUB_CLIENT_ID/i, purpose: 'GitHub OAuth app client ID', example: 'Iv1.abc123' },
  { pattern: /GITHUB_CLIENT_SECRET/i, purpose: 'GitHub OAuth app client secret', example: 'abc123...' },
  { pattern: /TWILIO_/i, purpose: 'Twilio SMS/voice credential', example: 'your-twilio-credential' },
  { pattern: /FIREBASE_/i, purpose: 'Firebase configuration', example: 'your-firebase-config' },
  { pattern: /CLOUDINARY_/i, purpose: 'Cloudinary media API', example: 'your-cloudinary-key' },
  { pattern: /_URL$|_URI$/i, purpose: 'Service endpoint URL', example: 'https://api.example.com' },
  { pattern: /_TOKEN$/i, purpose: 'Authentication token', example: 'your-auth-token' },
  { pattern: /_PASSWORD$|_PASSWD$/i, purpose: 'Service password', example: 'your-secure-password' },
  { pattern: /_HOST$/i, purpose: 'Service hostname', example: 'localhost' },
  { pattern: /_PORT$/i, purpose: 'Service port number', example: '5432' },
];

// File extensions to scan (skip binaries, generated files)
const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rb', '.php', '.java', '.kt',
  '.cs', '.fs', '.rs', '.ex', '.exs',
  '.yaml', '.yml', '.sh', '.bash', '.env.example',
  '.dockerfile', '', // Dockerfile
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
  '.venv', 'venv', 'vendor', 'target', 'bin', 'obj',
  '.terraform', 'coverage', '.nyc_output',
]);

// ===========================================
// SCANNER
// ===========================================

async function* walkDir(dir: string): AsyncGenerator<string> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const isDockerfile = entry.name.startsWith('Dockerfile') || entry.name === 'Dockerfile';
      if (SCAN_EXTENSIONS.has(ext) || isDockerfile) {
        yield fullPath;
      }
    }
  }
}

function inferPurpose(name: string): { purpose?: string; example?: string } {
  for (const hint of PURPOSE_HINTS) {
    if (hint.pattern.test(name)) {
      return { purpose: hint.purpose, example: hint.example };
    }
  }
  return {};
}

async function parseEnvExample(filePath: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
        result.set(key, value);
      }
    }
  } catch { /* ignore */ }
  return result;
}

export async function scanEnvVars(projectPath: string): Promise<ScanResult> {
  logger.info({ projectPath }, 'Scanning for env vars');

  const found = new Map<string, Set<string>>(); // name → set of source files

  // Check for .env.example
  let hasEnvExample = false;
  let exampleFilePath: string | undefined;
  let exampleVars = new Map<string, string>();

  for (const name of ['.env.example', '.env.sample', '.env.template', 'env.example']) {
    const p = path.join(projectPath, name);
    try {
      await fs.access(p);
      hasEnvExample = true;
      exampleFilePath = p;
      exampleVars = await parseEnvExample(p);
      // Add all vars from .env.example
      for (const [key] of exampleVars) {
        if (!SKIP_VARS.has(key)) {
          if (!found.has(key)) found.set(key, new Set());
          found.get(key)!.add(name);
        }
      }
      break;
    } catch { /* not found */ }
  }

  // Walk source files
  let scannedFiles = 0;
  for await (const filePath of walkDir(projectPath)) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relPath = path.relative(projectPath, filePath);
      scannedFiles++;

      for (const { regex } of PATTERNS) {
        // Reset lastIndex for global regex
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(content)) !== null) {
          const name = match[1];
          if (!name || SKIP_VARS.has(name) || name.length > 60) continue;
          if (!found.has(name)) found.set(name, new Set());
          found.get(name)!.add(relPath);
        }
      }
    } catch { /* skip unreadable files */ }
  }

  logger.info({ scannedFiles, foundVars: found.size }, 'Scan complete');

  // Build result
  const vars: EnvVar[] = Array.from(found.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, sourceSet]) => {
      const sources = Array.from(sourceSet);
      const hasDefault = exampleVars.has(name) && exampleVars.get(name) !== '';
      const { purpose, example } = inferPurpose(name);

      return {
        name,
        required: !hasDefault,
        hasDefault,
        sources,
        purpose,
        example,
      };
    });

  return { vars, hasEnvExample, exampleFilePath };
}
