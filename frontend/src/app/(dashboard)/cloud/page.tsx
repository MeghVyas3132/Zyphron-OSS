'use client';

import { useMemo, useState } from 'react';
import {
  Cloud,
  Plus,
  RefreshCw,
  Server,
  ArrowRightLeft,
  DollarSign,
  Settings,
  Scale,
  Globe,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCloudDeployments,
  useScaleDeployment,
  useCloudCostEstimate,
  useDeployToCloud,
  type CloudProvider,
} from '@/hooks/use-cloud';
import { useProjects } from '@/hooks/use-projects';
import type { Project } from '@/lib/api';

const providerLogos: Record<string, { name: string; color: string }> = {
  aws: { name: 'AWS', color: 'bg-foreground/80' },
  gcp: { name: 'Google Cloud', color: 'bg-foreground/70' },
  azure: { name: 'Azure', color: 'bg-foreground/60' },
  oracle: { name: 'Oracle Cloud', color: 'bg-foreground/90' },
};

function extractProjects(data: unknown): Project[] {
  if (!data || typeof data !== 'object' || !('data' in data)) return [];
  const payload = (data as { data?: unknown }).data;
  if (Array.isArray(payload)) return payload as Project[];
  if (payload && typeof payload === 'object' && 'projects' in payload && Array.isArray((payload as { projects?: unknown }).projects)) {
    return (payload as { projects: Project[] }).projects;
  }
  return [];
}

export default function CloudPage() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployForm, setDeployForm] = useState({
    projectId: '',
    image: '',
    provider: 'aws' as CloudProvider,
    region: 'us-east-1',
    cpu: '1',
    memory: '1Gi',
    replicas: 1,
  });

  const { data: deployments, isLoading: loadingDeployments, refetch } = useCloudDeployments();
  const scaleMutation = useScaleDeployment();
  const deployMutation = useDeployToCloud();
  const { data: costEstimate } = useCloudCostEstimate(selectedProvider || '');
  const { data: projectsData } = useProjects({ page: 1, limit: 100 });

  const projects = useMemo(() => extractProjects(projectsData), [projectsData]);

  const isLoading = loadingDeployments;

  const openDeployModal = () => {
    if (projects.length === 0) {
      toast.info('Create a project first, then deploy it to cloud.');
      return;
    }

    setDeployForm((prev) => ({
      ...prev,
      projectId: prev.projectId || projects[0].id,
      image: prev.image || 'nginx:latest',
      provider: (selectedProvider as CloudProvider) || prev.provider,
    }));
    setShowDeployModal(true);
  };

  const submitDeploy = async () => {
    if (!deployForm.projectId || !deployForm.image.trim()) {
      toast.error('Project and image are required.');
      return;
    }

    try {
      await deployMutation.mutateAsync({
        projectId: deployForm.projectId,
        image: deployForm.image.trim(),
        provider: deployForm.provider,
        region: deployForm.region,
        resources: {
          cpu: deployForm.cpu,
          memory: deployForm.memory,
          replicas: deployForm.replicas,
        },
      });
      toast.success('Cloud deployment created.');
      setShowDeployModal(false);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create cloud deployment.');
    }
  };

  const scaleDeployment = async (deploymentId: string, currentInstances: number) => {
    try {
      await scaleMutation.mutateAsync({
        deploymentId,
        instances: currentInstances + 1,
      });
      toast.success('Scale request submitted.');
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to scale deployment.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between stagger-in">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-3 mono-text-gradient">
            <Cloud className="h-8 w-8" />
            Multi-Cloud Deployment
          </h1>
          <p className="text-muted-foreground mt-1">
            Deploy and manage applications across AWS, GCP, Azure, and Oracle Cloud.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={openDeployModal}>
            <Plus className="h-4 w-4" />
            New Deployment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(providerLogos).map(([key, provider]) => (
          <button
            key={key}
            onClick={() => setSelectedProvider(key)}
            className={`p-6 premium-panel premium-card-hover text-left transition-all ${
              selectedProvider === key ? 'ring-2 ring-foreground/40' : ''
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-10 w-10 rounded-lg ${provider.color} flex items-center justify-center`}>
                <Cloud className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">{provider.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {deployments?.filter((d) => d.provider === key).length || 0} deployments
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-foreground" />
                Connected
              </span>
            </div>
          </button>
        ))}
      </div>

      {selectedProvider && costEstimate && (
        <div className="p-6 premium-panel stagger-in animate-delay-1">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <DollarSign className="h-5 w-5" />
            Cost Estimate for {providerLogos[selectedProvider]?.name}
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Monthly Estimate</p>
              <p className="text-2xl font-bold">${costEstimate.monthly?.toFixed(2) || '0.00'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Compute</p>
              <p className="text-lg font-medium">${costEstimate.breakdown?.compute?.toFixed(2) || '0.00'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Networking</p>
              <p className="text-lg font-medium">${costEstimate.breakdown?.networking?.toFixed(2) || '0.00'}</p>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-4">Active Deployments</h2>
        {deployments && deployments.length > 0 ? (
          <div className="space-y-3">
            {deployments.map((deployment) => (
              <div key={deployment.id} className="p-4 premium-panel flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`h-10 w-10 rounded-lg ${
                      providerLogos[deployment.provider]?.color || 'bg-gray-500'
                    } flex items-center justify-center`}
                  >
                    <Server className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium">{deployment.name || deployment.id}</h4>
                    <p className="text-sm text-muted-foreground">
                      {providerLogos[deployment.provider]?.name} • {deployment.region}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Instances</p>
                    <p className="font-medium">{deployment.instances || 1}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <span className="inline-flex items-center gap-1 text-sm">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          deployment.status === 'running'
                            ? 'bg-foreground'
                            : deployment.status === 'deploying'
                              ? 'bg-foreground/70'
                              : 'bg-foreground/50'
                        }`}
                      />
                      {deployment.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => scaleDeployment(deployment.id, deployment.instances || 1)}
                    >
                      <Scale className="h-4 w-4 mr-1" />
                      Scale
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toast.info('Failover orchestration is planned for the next phase.')}
                    >
                      <ArrowRightLeft className="h-4 w-4 mr-1" />
                      Failover
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toast.info('Deployment settings editor is not available yet.')}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 premium-panel">
            <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Cloud Deployments</h3>
            <p className="text-muted-foreground mb-4">Deploy your applications to multiple cloud providers.</p>
            <Button onClick={openDeployModal}>
              <Plus className="h-4 w-4 mr-2" />
              Create Deployment
            </Button>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Global Regions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1'].map((region) => (
            <div key={region} className="p-3 premium-panel text-center">
              <p className="font-mono text-sm">{region}</p>
              <p className="text-xs text-muted-foreground">Available</p>
            </div>
          ))}
        </div>
      </div>

      {showDeployModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/55" onClick={() => setShowDeployModal(false)} />
          <div className="relative w-full max-w-xl premium-panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Create Cloud Deployment</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowDeployModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Project</label>
                <select
                  className="w-full h-10 rounded-xl border border-input bg-card px-3"
                  value={deployForm.projectId}
                  onChange={(e) => setDeployForm((prev) => ({ ...prev, projectId: e.target.value }))}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Provider</label>
                <select
                  className="w-full h-10 rounded-xl border border-input bg-card px-3"
                  value={deployForm.provider}
                  onChange={(e) =>
                    setDeployForm((prev) => ({ ...prev, provider: e.target.value as CloudProvider }))
                  }
                >
                  {Object.keys(providerLogos).map((provider) => (
                    <option key={provider} value={provider}>
                      {providerLogos[provider].name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm text-muted-foreground">Container Image</label>
                <Input
                  value={deployForm.image}
                  onChange={(e) => setDeployForm((prev) => ({ ...prev, image: e.target.value }))}
                  placeholder="ghcr.io/org/app:latest"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Region</label>
                <Input
                  value={deployForm.region}
                  onChange={(e) => setDeployForm((prev) => ({ ...prev, region: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">CPU</label>
                <Input
                  value={deployForm.cpu}
                  onChange={(e) => setDeployForm((prev) => ({ ...prev, cpu: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Memory</label>
                <Input
                  value={deployForm.memory}
                  onChange={(e) => setDeployForm((prev) => ({ ...prev, memory: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Replicas</label>
                <Input
                  type="number"
                  min={1}
                  value={deployForm.replicas}
                  onChange={(e) =>
                    setDeployForm((prev) => ({ ...prev, replicas: Math.max(1, Number(e.target.value) || 1) }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowDeployModal(false)}>
                Cancel
              </Button>
              <Button onClick={submitDeploy} disabled={deployMutation.isPending}>
                {deployMutation.isPending ? 'Deploying...' : 'Deploy'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

