'use client';

import { useState } from 'react';
import { 
  Cloud, 
  Plus, 
  RefreshCw, 
  AlertCircle,
  Server,
  ArrowRightLeft,
  DollarSign,
  Settings,
  Play,
  Pause,
  Scale,
  Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  useCloudProviders, 
  useCloudDeployments, 
  useDeployToCloud,
  useScaleDeployment,
  useCloudCostEstimate
} from '@/hooks/use-cloud';

const providerLogos: Record<string, { name: string; color: string }> = {
  aws: { name: 'AWS', color: 'bg-orange-500' },
  gcp: { name: 'Google Cloud', color: 'bg-blue-500' },
  azure: { name: 'Azure', color: 'bg-sky-600' },
  oracle: { name: 'Oracle Cloud', color: 'bg-red-600' },
};

export default function CloudPage() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const { data: providers, isLoading: loadingProviders } = useCloudProviders();
  const { data: deployments, isLoading: loadingDeployments, refetch } = useCloudDeployments();
  const deployMutation = useDeployToCloud();
  const scaleMutation = useScaleDeployment();
  const { data: costEstimate } = useCloudCostEstimate(selectedProvider || '');

  const isLoading = loadingProviders || loadingDeployments;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Cloud className="h-8 w-8" />
            Multi-Cloud Deployment
          </h1>
          <p className="text-muted-foreground mt-1">
            Deploy and manage applications across AWS, GCP, Azure, and Oracle Cloud
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Deployment
          </Button>
        </div>
      </div>

      {/* Cloud Providers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(providerLogos).map(([key, provider]) => (
          <div
            key={key}
            onClick={() => setSelectedProvider(key)}
            className={`p-6 border rounded-lg cursor-pointer transition-all hover:shadow-lg ${
              selectedProvider === key ? 'ring-2 ring-primary' : ''
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-10 w-10 rounded-lg ${provider.color} flex items-center justify-center`}>
                <Cloud className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">{provider.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {deployments?.filter(d => d.provider === key).length || 0} deployments
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="flex items-center gap-1 text-green-500">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Connected
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Cost Estimation */}
      {selectedProvider && costEstimate && (
        <div className="p-6 border rounded-lg bg-muted/50">
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

      {/* Active Deployments */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Active Deployments</h2>
        {deployments && deployments.length > 0 ? (
          <div className="space-y-3">
            {deployments.map((deployment) => (
              <div
                key={deployment.id}
                className="p-4 border rounded-lg flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-lg ${providerLogos[deployment.provider]?.color || 'bg-gray-500'} flex items-center justify-center`}>
                    <Server className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium">{deployment.name}</h4>
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
                    <span className={`inline-flex items-center gap-1 text-sm ${
                      deployment.status === 'running' ? 'text-green-500' :
                      deployment.status === 'deploying' ? 'text-yellow-500' :
                      'text-red-500'
                    }`}>
                      <div className={`h-2 w-2 rounded-full ${
                        deployment.status === 'running' ? 'bg-green-500' :
                        deployment.status === 'deploying' ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`} />
                      {deployment.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => scaleMutation.mutate({ 
                        deploymentId: deployment.id, 
                        instances: (deployment.instances || 1) + 1 
                      })}
                    >
                      <Scale className="h-4 w-4 mr-1" />
                      Scale
                    </Button>
                    <Button variant="outline" size="sm">
                      <ArrowRightLeft className="h-4 w-4 mr-1" />
                      Failover
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Cloud Deployments</h3>
            <p className="text-muted-foreground mb-4">
              Deploy your applications to multiple cloud providers
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Deployment
            </Button>
          </div>
        )}
      </div>

      {/* Regions Overview */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Global Regions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1'].map((region) => (
            <div key={region} className="p-3 border rounded-lg text-center">
              <p className="font-mono text-sm">{region}</p>
              <p className="text-xs text-muted-foreground">Available</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
