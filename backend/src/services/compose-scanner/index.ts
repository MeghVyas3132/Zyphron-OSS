// ===========================================
// DOCKER COMPOSE SCANNER
// Parses docker-compose.yml / docker-compose.yaml and returns
// a structured manifest of services with metadata Zyphron can deploy.
// ===========================================

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createLogger } from '@/lib/logger.js';

const logger = createLogger('compose-scanner');

// ─── Types ──────────────────────────────────────────────────

export type ServiceKind = 'app' | 'database' | 'cache' | 'queue' | 'worker' | 'proxy';

export interface ComposeServiceDef {
  name: string;             // service key in compose file
  kind: ServiceKind;
  image?: string;           // base image if no build
  buildContext?: string;    // build.context or '.'
  dockerfile?: string;      // build.dockerfile
  ports: number[];          // first exposed port per service
  environment: Record<string, string>; // static env vars from compose
  envFiles: string[];       // .env_file references
  dependsOn: string[];      // service names this depends on
  command?: string;         // override command
  volumes: string[];        // volume mounts (names only)
  restart?: string;
  // enriched
  suggestedStartCommand?: string;
  suggestedPort?: number;
  isManagedByZyphron: boolean; // true → provision as Zyphron DB/Cache, not a container
  managedType?: 'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS';
  internalUrl?: string;     // how other services should reach this (set after deploy)
  networkAliases: string[]; // names other services use to reach this
}

export interface ComposeScanResult {
  composeFile: string;      // which file was found
  services: ComposeServiceDef[];
  networks: string[];
  hasEnvFile: boolean;
  appServices: ComposeServiceDef[];       // services to deploy as containers
  managedServices: ComposeServiceDef[];   // databases/caches to provision
}

// ─── Known managed images ────────────────────────────────────

const MANAGED_IMAGE_MAP: Record<string, { kind: ServiceKind; type: 'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS' }> = {
  postgres:    { kind: 'database', type: 'POSTGRESQL' },
  postgresql:  { kind: 'database', type: 'POSTGRESQL' },
  mysql:       { kind: 'database', type: 'MYSQL' },
  mariadb:     { kind: 'database', type: 'MYSQL' },
  mongo:       { kind: 'cache',    type: 'MONGODB' },
  mongodb:     { kind: 'cache',    type: 'MONGODB' },
  redis:       { kind: 'cache',    type: 'REDIS' },
};

function classifyImage(image: string | undefined): { managed: boolean; kind: ServiceKind; managedType?: 'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS' } {
  if (!image) return { managed: false, kind: 'app' };
  const base = image.split(':')[0].split('/').pop()?.toLowerCase() ?? '';
  for (const [key, val] of Object.entries(MANAGED_IMAGE_MAP)) {
    if (base === key || base.startsWith(key)) {
      return { managed: true, kind: val.kind, managedType: val.type };
    }
  }
  return { managed: false, kind: 'app' };
}

function classifyByName(name: string): ServiceKind {
  const n = name.toLowerCase();
  if (/worker|celery|sidekiq|resque|queue/.test(n)) return 'worker';
  if (/nginx|traefik|proxy|gateway/.test(n)) return 'proxy';
  if (/redis|cache/.test(n)) return 'cache';
  if (/db|database|postgres|mysql|mongo/.test(n)) return 'database';
  return 'app';
}

function parsePort(portStr: string | number): number | null {
  const s = String(portStr);
  // "host:container" or "container" or "host:container/proto"
  const parts = s.split(':');
  const containerPart = parts[parts.length - 1].split('/')[0];
  const n = parseInt(containerPart, 10);
  return isNaN(n) ? null : n;
}

function normalizeEnv(env: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!env) return out;
  if (Array.isArray(env)) {
    for (const e of env) {
      if (typeof e === 'string') {
        const [k, ...rest] = e.split('=');
        if (k) out[k.trim()] = rest.join('=');
      }
    }
  } else if (typeof env === 'object') {
    for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
      out[k] = v !== null && v !== undefined ? String(v) : '';
    }
  }
  return out;
}

function normalizeDependsOn(dep: unknown): string[] {
  if (!dep) return [];
  if (Array.isArray(dep)) return dep.map(String);
  if (typeof dep === 'object') return Object.keys(dep);
  return [];
}

function resolveNetworkAliases(svcName: string, svcDef: Record<string, unknown>): string[] {
  const aliases: string[] = [svcName];
  const networks = svcDef['networks'];
  if (networks && typeof networks === 'object' && !Array.isArray(networks)) {
    for (const netDef of Object.values(networks as Record<string, unknown>)) {
      if (netDef && typeof netDef === 'object') {
        const a = (netDef as Record<string, unknown>)['aliases'];
        if (Array.isArray(a)) aliases.push(...a.map(String));
      }
    }
  }
  return [...new Set(aliases)];
}

// ─── Main scanner ────────────────────────────────────────────

export async function scanComposeFile(repoDir: string): Promise<ComposeScanResult | null> {
  // Try all common filenames
  const candidates = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
    'docker-compose.prod.yml',
    'docker-compose.production.yml',
  ];

  let composeFile: string | null = null;
  let raw = '';

  for (const candidate of candidates) {
    try {
      raw = await fs.readFile(path.join(repoDir, candidate), 'utf-8');
      composeFile = candidate;
      break;
    } catch {
      // try next
    }
  }

  if (!composeFile || !raw) {
    logger.debug({ repoDir }, 'No docker-compose file found');
    return null;
  }

  logger.info({ composeFile }, 'Parsing docker-compose file');

  let doc: Record<string, unknown>;
  try {
    doc = parseYaml(raw) as Record<string, unknown>;
  } catch (err) {
    logger.warn({ err }, 'Failed to parse docker-compose YAML');
    return null;
  }

  const rawServices = (doc['services'] as Record<string, unknown>) ?? {};
  const rawNetworks = Object.keys((doc['networks'] as Record<string, unknown>) ?? {});

  // Check for .env file
  const hasEnvFile = await fs.access(path.join(repoDir, '.env'))
    .then(() => true)
    .catch(() => false);

  const services: ComposeServiceDef[] = [];

  for (const [svcName, svcRaw] of Object.entries(rawServices)) {
    const svc = (svcRaw ?? {}) as Record<string, unknown>;

    // Resolve image
    const image = svc['image'] as string | undefined;
    const build = svc['build'];
    let buildContext: string | undefined;
    let dockerfile: string | undefined;

    if (build) {
      if (typeof build === 'string') {
        buildContext = build;
      } else if (typeof build === 'object') {
        buildContext = (build as Record<string, unknown>)['context'] as string ?? '.';
        dockerfile = (build as Record<string, unknown>)['dockerfile'] as string | undefined;
      }
    }

    // Classify
    const imageClass = classifyImage(image);
    const kind: ServiceKind = imageClass.managed
      ? imageClass.kind
      : (buildContext != null ? classifyByName(svcName) : classifyImage(image).kind || classifyByName(svcName));

    // Ports
    const rawPorts = (svc['ports'] as (string | number)[] | undefined) ?? [];
    const ports = rawPorts.map(parsePort).filter((p): p is number => p !== null);

    // Environment
    const environment = normalizeEnv(svc['environment']);

    // Env files
    const envFileRaw = svc['env_file'];
    const envFiles: string[] = Array.isArray(envFileRaw) ? envFileRaw.map(String) : envFileRaw ? [String(envFileRaw)] : [];

    // Depends on
    const dependsOn = normalizeDependsOn(svc['depends_on']);

    // Command
    const cmd = svc['command'];
    const command = typeof cmd === 'string' ? cmd : Array.isArray(cmd) ? (cmd as string[]).join(' ') : undefined;

    // Volumes (names only, not full paths)
    const rawVols = (svc['volumes'] as (string | Record<string, unknown>)[] | undefined) ?? [];
    const volumes = rawVols.map((v) => typeof v === 'string' ? v.split(':')[0] : String((v as Record<string, unknown>)['source'] ?? '')).filter(Boolean);

    // Network aliases
    const networkAliases = resolveNetworkAliases(svcName, svc);

    // Suggested port (first exposed port, or common defaults)
    const DEFAULT_PORTS: Record<string, number> = { app: 3000, worker: 0, proxy: 80, database: 5432, cache: 6379, queue: 5672 };
    const suggestedPort = ports[0] ?? DEFAULT_PORTS[kind] ?? 3000;

    // Suggested start command for worker kind
    let suggestedStartCommand: string | undefined = command;
    if (!suggestedStartCommand && kind === 'worker') {
      if (image?.includes('celery') || environment['CELERY_BROKER_URL']) {
        suggestedStartCommand = 'celery -A app.celery worker --loglevel=info';
      }
    }

    services.push({
      name: svcName,
      kind,
      image,
      buildContext,
      dockerfile,
      ports,
      environment,
      envFiles,
      dependsOn,
      command,
      volumes,
      restart: svc['restart'] as string | undefined,
      suggestedStartCommand,
      suggestedPort,
      isManagedByZyphron: imageClass.managed,
      managedType: imageClass.managedType,
      networkAliases,
    });
  }

  // Sort: managed services first (they'll be provisioned), then apps
  services.sort((a, b) => {
    if (a.isManagedByZyphron && !b.isManagedByZyphron) return -1;
    if (!a.isManagedByZyphron && b.isManagedByZyphron) return 1;
    // Among apps: no deps first
    return a.dependsOn.length - b.dependsOn.length;
  });

  return {
    composeFile,
    services,
    networks: rawNetworks,
    hasEnvFile,
    appServices: services.filter(s => !s.isManagedByZyphron),
    managedServices: services.filter(s => s.isManagedByZyphron),
  };
}
