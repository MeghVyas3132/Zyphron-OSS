// ===========================================
// SERVICES INDEX
// Exports all deployment services
// ===========================================

// Detector Service - Auto-detect project type and framework
export {
  detectProject,
  type DetectionResult,
  type FrameworkType,
  type Language,
  type PackageManager,
  type ProjectType,
} from './detector/index.js';

// Git Service - Repository cloning and management
export {
  GitService,
  getGitService,
  type CloneResult,
  type CommitInfo,
  type BranchInfo,
  type GitProvider,
} from './git/index.js';

// Builder Service - Docker image building
export {
  BuilderService,
  getBuilderService,
  type BuildOptions,
  type BuildResult,
  type PushResult,
} from './builder/index.js';

// Deployer Service - Container deployment and management
export {
  DeployerService,
  getDeployerService,
  type DeployOptions,
  type DeployResult,
  type ContainerInfo,
  type HealthCheckConfig,
} from './deployer/index.js';

// AI Service - Project analysis and recommendations
export { aiEngine } from './ai/index.js';

// Caching Service - Smart build caching
export { cachingService, cacheKeyGenerator } from './caching/index.js';

// Multi-Cloud Service - Multi-provider deployments
export { multiCloudService } from './cloud/index.js';

// Deployment Strategies - Rolling, Blue-Green, Canary
export { deploymentStrategiesService } from './strategies/index.js';

// Database Branching - Branch databases for previews
export { databaseBranchingService } from './database/branching.js';

// Edge Functions - Serverless at the edge
export { edgeFunctionsService } from './edge/index.js';

// Observability - Metrics, Tracing, Alerts
export { observabilityService } from './observability/index.js';

// Chaos Engineering - Resilience testing
export { chaosEngineeringService } from './chaos/index.js';

// Preview Environments - PR-based previews
export { PreviewEnvironmentService } from './preview/index.js';

// Self-Deployment - Zyphron on Zyphron
export { selfDeploymentService } from './self-deploy/index.js';
