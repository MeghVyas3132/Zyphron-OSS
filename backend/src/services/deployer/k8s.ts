// ===========================================
// KUBERNETES DEPLOYER SERVICE
// Deploys user projects as K8s Deployments + Services + Ingress
// Supports: websockets, sidecars (celery/workers), shared Kafka/Redis/Postgres
// ===========================================

import * as k8s from '@kubernetes/client-node';
import { createLogger } from '../../lib/logger.js';
import { config } from '../../config/index.js';

const logger = createLogger('k8s-deployer');

// ===========================================
// TYPES
// ===========================================

export interface K8sDeployOptions {
  deploymentId: string;
  projectId: string;
  projectSlug: string;
  imageName: string;          // full image ref: registry/project:tag
  envVars?: Record<string, string>;
  port?: number;
  memory?: string;            // e.g. "512Mi"
  cpu?: string;               // e.g. "500m"
  replicas?: number;
  // Sidecar detection
  hasCelery?: boolean;        // spin up celery worker sidecar
  hasKafka?: boolean;         // inject KAFKA_BROKERS
  hasRedis?: boolean;         // inject REDIS_URL
  hasDatabase?: boolean;      // inject DATABASE_URL (shared Postgres db per project)
  // WebSocket / special routing
  supportsWebSockets?: boolean;
}

export interface K8sDeployResult {
  success: boolean;
  namespace: string;
  deploymentName: string;
  serviceName: string;
  internalUrl?: string;
  externalUrl?: string;
  error?: string;
}

// ===========================================
// K8S CLIENT FACTORY
// ===========================================

function getK8sClients() {
  const kc = new k8s.KubeConfig();

  if (process.env.KUBECONFIG) {
    kc.loadFromFile(process.env.KUBECONFIG);
  } else if (process.env.K8S_IN_CLUSTER === 'true') {
    kc.loadFromCluster();
  } else {
    kc.loadFromDefault();
  }

  return {
    core: kc.makeApiClient(k8s.CoreV1Api),
    apps: kc.makeApiClient(k8s.AppsV1Api),
    networking: kc.makeApiClient(k8s.NetworkingV1Api),
    customObjects: kc.makeApiClient(k8s.CustomObjectsApi),
  };
}

// ===========================================
// RESOURCE NAME HELPERS
// ===========================================

function ns(slug: string) { return `zyphron-user-${slug}`; }
function depName(slug: string) { return `app-${slug}`; }
function svcName(slug: string) { return `svc-${slug}`; }

function toK8sMemory(raw: string): string {
  // Convert Docker-style "512m" → K8s "512Mi", "1g" → "1Gi"
  return raw
    .replace(/(\d+)m$/i, '$1Mi')
    .replace(/(\d+)g$/i, '$1Gi')
    .replace(/(\d+)k$/i, '$1Ki');
}

function toK8sCpu(raw: string): string {
  // "0.5" → "500m", "1" → "1000m"
  const val = parseFloat(raw);
  return isNaN(val) ? raw : `${Math.round(val * 1000)}m`;
}

// ===========================================
// SHARED INFRA ENV INJECTION
// ===========================================

function buildEnvVars(
  options: K8sDeployOptions
): k8s.V1EnvVar[] {
  const base: Record<string, string> = {
    NODE_ENV: 'production',
    PORT: String(options.port ?? 3000),
    ZYPHRON_DEPLOYMENT_ID: options.deploymentId,
    ZYPHRON_PROJECT_ID: options.projectId,
    ...(options.envVars ?? {}),
  };

  // Shared Kafka (in-cluster)
  if (options.hasKafka && !base.KAFKA_BROKERS) {
    base.KAFKA_BROKERS = `kafka.zyphron-system.svc.cluster.local:9092`;
    base.KAFKA_CLIENT_ID = options.projectSlug;
  }

  // Shared Redis — per-project DB number derived from slug hash
  if (options.hasRedis && !base.REDIS_URL) {
    const dbNum = Math.abs(hashCode(options.projectSlug)) % 14 + 1; // 1-14 (DB 0 reserved)
    base.REDIS_URL = `redis://redis.zyphron-system.svc.cluster.local:6379/${dbNum}`;
    base.CELERY_BROKER_URL = base.REDIS_URL;
    base.CELERY_RESULT_BACKEND = base.REDIS_URL;
  }

  return Object.entries(base).map(([name, value]) => ({ name, value }));
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return h;
}

// ===========================================
// NAMESPACE
// ===========================================

async function ensureNamespace(core: k8s.CoreV1Api, namespace: string): Promise<void> {
  try {
    await core.readNamespace({ name: namespace });
  } catch {
    await core.createNamespace({
      body: {
        metadata: {
          name: namespace,
          labels: {
            'zyphron.managed': 'true',
            'app.kubernetes.io/managed-by': 'zyphron',
          },
        },
      },
    });
    logger.info({ namespace }, 'Created namespace');
  }
}

// ===========================================
// DEPLOYMENT
// ===========================================

async function upsertDeployment(
  apps: k8s.AppsV1Api,
  namespace: string,
  options: K8sDeployOptions
): Promise<void> {
  const name = depName(options.projectSlug);
  const mem = toK8sMemory(options.memory ?? '512Mi');
  const cpu = toK8sCpu(options.cpu ?? '0.5');
  const port = options.port ?? 3000;
  const envVars = buildEnvVars(options);

  const containers: k8s.V1Container[] = [
    {
      name: 'app',
      image: options.imageName,
      ports: [{ containerPort: port, protocol: 'TCP' }],
      env: envVars,
      resources: {
        requests: { memory: mem, cpu: `${Math.round(parseInt(cpu) / 2)}m` },
        limits:   { memory: mem, cpu },
      },
      readinessProbe: {
        httpGet: { path: '/health', port: port },
        initialDelaySeconds: 10,
        periodSeconds: 10,
        failureThreshold: 3,
      },
      livenessProbe: {
        httpGet: { path: '/health', port: port },
        initialDelaySeconds: 30,
        periodSeconds: 20,
        failureThreshold: 5,
      },
    },
  ];

  // Celery worker sidecar
  if (options.hasCelery) {
    containers.push({
      name: 'celery-worker',
      image: options.imageName,
      command: ['celery', '-A', 'app.celery', 'worker', '--loglevel=info'],
      env: envVars,
      resources: {
        requests: { memory: '256Mi', cpu: '100m' },
        limits:   { memory: '512Mi', cpu: '500m' },
      },
    });
  }

  const deploymentBody: k8s.V1Deployment = {
    metadata: {
      name,
      namespace,
      labels: {
        'app': name,
        'zyphron.project': options.projectSlug,
        'zyphron.deployment': options.deploymentId,
      },
      annotations: {
        'zyphron.deployment-id': options.deploymentId,
        'zyphron.project-id': options.projectId,
      },
    },
    spec: {
      replicas: options.replicas ?? 1,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name, 'zyphron.project': options.projectSlug } },
        spec: {
          containers,
          restartPolicy: 'Always',
          terminationGracePeriodSeconds: 30,
        },
      },
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: { maxSurge: 1, maxUnavailable: 0 },
      },
    },
  };

  try {
    await apps.readNamespacedDeployment({ name, namespace });
    // Update existing
    await apps.replaceNamespacedDeployment({ name, namespace, body: deploymentBody });
    logger.info({ name, namespace }, 'Deployment updated');
  } catch {
    // Create new
    await apps.createNamespacedDeployment({ namespace, body: deploymentBody });
    logger.info({ name, namespace }, 'Deployment created');
  }
}

// ===========================================
// SERVICE
// ===========================================

async function upsertService(
  core: k8s.CoreV1Api,
  namespace: string,
  options: K8sDeployOptions
): Promise<void> {
  const name = svcName(options.projectSlug);
  const depLabel = depName(options.projectSlug);
  const port = options.port ?? 3000;

  const body: k8s.V1Service = {
    metadata: {
      name,
      namespace,
      labels: { 'zyphron.project': options.projectSlug },
      annotations: {
        // Tell Traefik to handle WebSocket upgrades for this service
        ...(options.supportsWebSockets
          ? { 'traefik.ingress.kubernetes.io/router.middlewares': 'zyphron-system-websocket@kubernetescrd' }
          : {}),
      },
    },
    spec: {
      selector: { app: depLabel },
      ports: [{ port: 80, targetPort: port, protocol: 'TCP', name: 'http' }],
      type: 'ClusterIP',
    },
  };

  try {
    await core.readNamespacedService({ name, namespace });
    await core.replaceNamespacedService({ name, namespace, body });
  } catch {
    await core.createNamespacedService({ namespace, body });
  }
  logger.info({ name, namespace }, 'Service upserted');
}

// ===========================================
// INGRESS (Traefik-aware)
// ===========================================

async function upsertIngress(
  networking: k8s.NetworkingV1Api,
  namespace: string,
  options: K8sDeployOptions
): Promise<void> {
  const name = `ingress-${options.projectSlug}`;
  const svc = svcName(options.projectSlug);
  const host = `${options.projectSlug}.${config.deployment.baseDomain}`;

  const body: k8s.V1Ingress = {
    metadata: {
      name,
      namespace,
      annotations: {
        'kubernetes.io/ingress.class': 'traefik',
        'traefik.ingress.kubernetes.io/router.entrypoints': 'web,websecure',
        ...(options.supportsWebSockets
          ? { 'traefik.ingress.kubernetes.io/router.middlewares': 'zyphron-system-websocket@kubernetescrd' }
          : {}),
      },
    },
    spec: {
      rules: [
        {
          host,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: svc, port: { number: 80 } },
                },
              },
            ],
          },
        },
      ],
    },
  };

  try {
    await networking.readNamespacedIngress({ name, namespace });
    await networking.replaceNamespacedIngress({ name, namespace, body });
  } catch {
    await networking.createNamespacedIngress({ namespace, body });
  }
  logger.info({ name, namespace, host }, 'Ingress upserted');
}

// ===========================================
// DEPLOY (main entry point)
// ===========================================

export async function k8sDeploy(options: K8sDeployOptions): Promise<K8sDeployResult> {
  const namespace = ns(options.projectSlug);
  const { core, apps, networking } = getK8sClients();

  logger.info({ ...options, namespace }, 'Starting K8s deployment');

  try {
    await ensureNamespace(core, namespace);
    await upsertDeployment(apps, namespace, options);
    await upsertService(core, namespace, options);
    await upsertIngress(networking, namespace, options);

    const proto = config.deployment.useHttps ? 'https' : 'http';
    const externalUrl = `${proto}://${options.projectSlug}.${config.deployment.baseDomain}`;
    const internalUrl = `http://${svcName(options.projectSlug)}.${namespace}.svc.cluster.local`;

    logger.info({ namespace, externalUrl }, 'K8s deployment complete');

    return {
      success: true,
      namespace,
      deploymentName: depName(options.projectSlug),
      serviceName: svcName(options.projectSlug),
      internalUrl,
      externalUrl,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg, namespace }, 'K8s deployment failed');
    return {
      success: false,
      namespace,
      deploymentName: depName(options.projectSlug),
      serviceName: svcName(options.projectSlug),
      error: msg,
    };
  }
}

// ===========================================
// TEARDOWN
// ===========================================

export async function k8sDelete(projectSlug: string): Promise<boolean> {
  const namespace = ns(projectSlug);
  const { core } = getK8sClients();

  try {
    await core.deleteNamespace({ name: namespace });
    logger.info({ namespace }, 'Namespace deleted (all resources removed)');
    return true;
  } catch (error) {
    logger.warn({ namespace, error }, 'Failed to delete namespace');
    return false;
  }
}

// ===========================================
// SCALE
// ===========================================

export async function k8sScale(projectSlug: string, replicas: number): Promise<boolean> {
  const namespace = ns(projectSlug);
  const name = depName(projectSlug);
  const { apps } = getK8sClients();

  try {
    await apps.patchNamespacedDeployment({
      name,
      namespace,
      body: { spec: { replicas } },
    });
    logger.info({ namespace, name, replicas }, 'Deployment scaled');
    return true;
  } catch (error) {
    logger.error({ namespace, name, replicas, error }, 'Scale failed');
    return false;
  }
}

// ===========================================
// STATUS
// ===========================================

export async function k8sGetStatus(projectSlug: string): Promise<{
  ready: number;
  desired: number;
  available: number;
} | null> {
  const namespace = ns(projectSlug);
  const name = depName(projectSlug);
  const { apps } = getK8sClients();

  try {
    const dep = await apps.readNamespacedDeployment({ name, namespace });
    const status = dep.status;
    return {
      ready: status?.readyReplicas ?? 0,
      desired: status?.replicas ?? 1,
      available: status?.availableReplicas ?? 0,
    };
  } catch {
    return null;
  }
}
