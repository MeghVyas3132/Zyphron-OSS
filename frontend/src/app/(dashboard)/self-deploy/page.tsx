'use client';

import { useState } from 'react';
import { 
  Server, 
  RefreshCw, 
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Clock,
  Container,
  GitBranch,
  Layers,
  Cpu,
  HardDrive,
  MemoryStick,
  Shield,
  Terminal,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  useSystemHealth,
  useCurrentVersion,
  useDeploymentManifest,
  useSelfDeploy,
  useSelfDeployments,
  useRollbackDeployment
} from '@/hooks/use-self-deploy';

const components = ['api', 'worker', 'frontend'] as const;

export default function SelfDeployPage() {
  const [selectedStrategy, setSelectedStrategy] = useState<'rolling' | 'blue-green' | 'canary'>('rolling');
  const [selectedComponents, setSelectedComponents] = useState<string[]>(['api', 'worker', 'frontend']);
  const [targetVersion, setTargetVersion] = useState('');

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useSystemHealth();
  const { data: version } = useCurrentVersion();
  const { data: manifest } = useDeploymentManifest();
  const { data: deployments, refetch: refetchDeployments } = useSelfDeployments();
  
  const selfDeployMutation = useSelfDeploy();
  const rollbackMutation = useRollbackDeployment();

  const toggleComponent = (component: string) => {
    setSelectedComponents((prev: string[]) => 
      prev.includes(component) 
        ? prev.filter((c: string) => c !== component)
        : [...prev, component]
    );
  };

  const handleDeploy = () => {
    selfDeployMutation.mutate({
      version: targetVersion || 'latest',
      strategy: selectedStrategy,
      components: {
        api: selectedComponents.includes('api'),
        worker: selectedComponents.includes('worker'),
        frontend: selectedComponents.includes('frontend'),
      },
    }, {
      onSuccess: () => {
        refetchDeployments();
        refetchHealth();
      }
    });
  };

  const handleRollback = (deploymentId: string) => {
    rollbackMutation.mutate(deploymentId, {
      onSuccess: () => {
        refetchDeployments();
        refetchHealth();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Zap className="h-8 w-8 text-yellow-500" />
            Self-Deployment
          </h1>
          <p className="text-muted-foreground mt-1">
            Zyphron on Zyphron - Deploy and manage the platform itself
          </p>
        </div>
        <Button onClick={() => { refetchHealth(); refetchDeployments(); }} variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`p-4 border rounded-lg ${
          health?.status === 'healthy' ? 'border-green-500/50 bg-green-500/5' :
          health?.status === 'degraded' ? 'border-yellow-500/50 bg-yellow-500/5' :
          'border-red-500/50 bg-red-500/5'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
              health?.status === 'healthy' ? 'bg-green-500' :
              health?.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
            }`}>
              {health?.status === 'healthy' ? (
                <CheckCircle className="h-5 w-5 text-white" />
              ) : health?.status === 'degraded' ? (
                <AlertTriangle className="h-5 w-5 text-white" />
              ) : (
                <XCircle className="h-5 w-5 text-white" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">System Status</p>
              <p className="font-semibold capitalize">{healthLoading ? 'Loading...' : health?.status || 'Unknown'}</p>
            </div>
          </div>
        </div>

        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center">
              <GitBranch className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Version</p>
              <p className="font-semibold font-mono">{version || 'v0.0.0'}</p>
            </div>
          </div>
        </div>

        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500 flex items-center justify-center">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Uptime</p>
              <p className="font-semibold">{health?.uptime || '0h 0m'}</p>
            </div>
          </div>
        </div>

        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-500 flex items-center justify-center">
              <Container className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Containers</p>
              <p className="font-semibold">{health?.containers?.running || 0} / {health?.containers?.total || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Component Health */}
      <div className="p-6 border rounded-lg">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Component Health
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {components.map((component) => {
            const componentHealth = health?.components?.[component];
            const isHealthy = componentHealth?.status === 'healthy';
            
            return (
              <div key={component} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    <span className="font-medium capitalize">{component}</span>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    isHealthy ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                  }`}>
                    {componentHealth?.status || 'Unknown'}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Cpu className="h-3 w-3" /> CPU
                    </span>
                    <span>{componentHealth?.cpu || '0%'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <MemoryStick className="h-3 w-3" /> Memory
                    </span>
                    <span>{componentHealth?.memory || '0 MB'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <HardDrive className="h-3 w-3" /> Version
                    </span>
                    <span className="font-mono text-xs">{componentHealth?.version || 'v0.0.0'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New Deployment */}
      <div className="p-6 border rounded-lg bg-gradient-to-r from-purple-500/5 to-blue-500/5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          Deploy New Version
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Target Version */}
          <div>
            <label className="text-sm font-medium mb-2 block">Target Version</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={version?.latest || 'e.g., v1.2.3'}
                value={targetVersion}
                onChange={(e) => setTargetVersion(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg bg-background"
              />
              {version && (
                <Button 
                  variant="outline" 
                  onClick={() => setTargetVersion(version)}
                >
                  Latest ({version})
                </Button>
              )}
            </div>
          </div>

          {/* Strategy Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Deployment Strategy</label>
            <div className="flex gap-2">
              {['rolling', 'blue-green', 'canary'].map((strategy) => (
                <Button
                  key={strategy}
                  variant={selectedStrategy === strategy ? 'default' : 'outline'}
                  onClick={() => setSelectedStrategy(strategy as typeof selectedStrategy)}
                  className="flex-1 capitalize"
                >
                  {strategy.replace('-', ' ')}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Component Selection */}
        <div className="mt-4">
          <label className="text-sm font-medium mb-2 block">Components to Deploy</label>
          <div className="flex gap-2">
            {components.map((component) => (
              <Button
                key={component}
                variant={selectedComponents.includes(component) ? 'default' : 'outline'}
                onClick={() => toggleComponent(component)}
                className="capitalize"
              >
                <Container className="h-4 w-4 mr-2" />
                {component}
              </Button>
            ))}
          </div>
        </div>

        {/* Deploy Button */}
        <div className="mt-6 flex justify-end">
          <Button 
            size="lg"
            onClick={handleDeploy}
            disabled={selfDeployMutation.isPending || selectedComponents.length === 0}
            className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
          >
            {selfDeployMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Deploy Zyphron
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Deployment Manifest Preview */}
      {manifest && (
        <div className="p-6 border rounded-lg">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Deployment Manifest
          </h2>
          <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono max-h-64">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </div>
      )}

      {/* Deployment History */}
      <div className="p-6 border rounded-lg">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Deployment History
        </h2>
        
        {deployments && deployments.length > 0 ? (
          <div className="space-y-3">
            {deployments.map((deployment) => (
              <div 
                key={deployment.id}
                className={`p-4 border rounded-lg ${
                  deployment.status === 'in-progress' ? 'border-blue-500/50' :
                  deployment.status === 'completed' ? 'border-green-500/50' :
                  deployment.status === 'failed' ? 'border-red-500/50' :
                  deployment.status === 'rolled-back' ? 'border-yellow-500/50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      deployment.status === 'in-progress' ? 'bg-blue-500' :
                      deployment.status === 'completed' ? 'bg-green-500' :
                      deployment.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                    }`}>
                      {deployment.status === 'in-progress' && <RefreshCw className="h-5 w-5 text-white animate-spin" />}
                      {deployment.status === 'completed' && <CheckCircle className="h-5 w-5 text-white" />}
                      {deployment.status === 'failed' && <XCircle className="h-5 w-5 text-white" />}
                      {deployment.status === 'rolled-back' && <RotateCcw className="h-5 w-5 text-white" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {deployment.fromVersion} → {deployment.toVersion}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          deployment.strategy === 'rolling' ? 'bg-blue-500/20 text-blue-500' :
                          deployment.strategy === 'blue-green' ? 'bg-green-500/20 text-green-500' :
                          'bg-yellow-500/20 text-yellow-500'
                        }`}>
                          {deployment.strategy}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span>ID: {deployment.id.slice(0, 8)}</span>
                        <span>Components: {deployment.components?.join(', ') || 'all'}</span>
                        <span>{new Date(deployment.startedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {deployment.status === 'completed' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRollback(deployment.id)}
                        disabled={rollbackMutation.isPending}
                        className="text-yellow-500"
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Rollback
                      </Button>
                    )}
                    {deployment.status === 'in-progress' && (
                      <Button variant="outline" size="sm" className="text-red-500">
                        <Pause className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {deployment.status === 'in-progress' && deployment.progress && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">{deployment.progress.phase}</span>
                      <span>{deployment.progress.percentage}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${deployment.progress.percentage}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No deployments yet</p>
            <p className="text-sm">Deploy a new version above to get started</p>
          </div>
        )}
      </div>

      {/* Security Notice */}
      <div className="p-4 border rounded-lg border-yellow-500/30 bg-yellow-500/5">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-yellow-500 mt-0.5" />
          <div>
            <h3 className="font-semibold text-yellow-500">Security Notice</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Self-deployment operations require admin privileges. All deployments are logged and audited.
              Make sure to test new versions in a staging environment before deploying to production.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
