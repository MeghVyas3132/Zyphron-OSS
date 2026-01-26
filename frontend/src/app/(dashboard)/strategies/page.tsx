'use client';

import { useState } from 'react';
import { 
  Rocket, 
  RefreshCw, 
  ArrowRight,
  CheckCircle,
  XCircle,
  Clock,
  Layers,
  Percent,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Settings,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  useStrategyDeployments,
  useRollingDeploy,
  useBlueGreenDeploy,
  useCanaryDeploy,
  useStrategyRecommendation
} from '@/hooks/use-strategies';

const strategies = [
  {
    id: 'rolling',
    name: 'Rolling Update',
    description: 'Gradually replace instances one at a time with zero downtime',
    icon: RefreshCw,
    color: 'bg-blue-500',
    pros: ['Zero downtime', 'Easy rollback', 'Resource efficient'],
    cons: ['Slower deployment', 'Mixed versions temporarily'],
    bestFor: 'Most applications, especially stateless services',
  },
  {
    id: 'blue-green',
    name: 'Blue-Green',
    description: 'Deploy to identical environment, then switch traffic instantly',
    icon: Layers,
    color: 'bg-green-500',
    pros: ['Instant rollback', 'Full testing before switch', 'No mixed versions'],
    cons: ['Double resources needed', 'Database migrations tricky'],
    bestFor: 'Critical applications requiring instant rollback capability',
  },
  {
    id: 'canary',
    name: 'Canary',
    description: 'Gradually shift traffic to new version while monitoring metrics',
    icon: Percent,
    color: 'bg-yellow-500',
    pros: ['Minimal risk', 'Real user testing', 'Data-driven decisions'],
    cons: ['Complex setup', 'Slower full rollout', 'Requires good monitoring'],
    bestFor: 'High-traffic applications where risk must be minimized',
  },
];

export default function StrategiesPage() {
  const [selectedProjectId] = useState('default');
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  
  const { data: deployments, isLoading, refetch } = useStrategyDeployments(selectedProjectId);
  const { data: recommendation } = useStrategyRecommendation(selectedProjectId);
  const rollingMutation = useRollingDeploy();
  const blueGreenMutation = useBlueGreenDeploy();
  const canaryMutation = useCanaryDeploy();

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
            <Rocket className="h-8 w-8" />
            Deployment Strategies
          </h1>
          <p className="text-muted-foreground mt-1">
            Choose how to deploy your applications with zero-downtime strategies
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* AI Recommendation */}
      {recommendation && (
        <div className="p-4 border rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-purple-500 mt-0.5" />
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                AI Recommendation: {recommendation.strategy.charAt(0).toUpperCase() + recommendation.strategy.slice(1)}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{recommendation.reason}</p>
              <div className="flex gap-4 mt-2">
                <div>
                  <span className="text-xs text-muted-foreground">Benefits:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {recommendation.benefits?.slice(0, 3).map((benefit: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-green-500/20 text-green-500 rounded">
                        {benefit}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {strategies.map((strategy) => {
          const Icon = strategy.icon;
          const isSelected = selectedStrategy === strategy.id;
          
          return (
            <div
              key={strategy.id}
              onClick={() => setSelectedStrategy(strategy.id)}
              className={`p-6 border rounded-lg cursor-pointer transition-all hover:shadow-lg ${
                isSelected ? 'ring-2 ring-primary border-primary' : ''
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`h-10 w-10 rounded-lg ${strategy.color} flex items-center justify-center`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold">{strategy.name}</h3>
                  {recommendation?.strategy === strategy.id && (
                    <span className="text-xs text-purple-500">✨ Recommended</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{strategy.description}</p>
              
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-green-500 mb-1">Pros:</p>
                  <div className="flex flex-wrap gap-1">
                    {strategy.pros.map((pro, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded">
                        {pro}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-red-500 mb-1">Cons:</p>
                  <div className="flex flex-wrap gap-1">
                    {strategy.cons.map((con, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded">
                        {con}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Best for:</strong> {strategy.bestFor}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Deploy Button */}
      {selectedStrategy && (
        <div className="flex justify-center">
          <Button 
            size="lg"
            onClick={() => {
              const input = {
                projectId: selectedProjectId,
                deploymentId: `deploy-${Date.now()}`,
                strategy: selectedStrategy as 'rolling' | 'blue-green' | 'canary',
              };
              
              if (selectedStrategy === 'rolling') {
                rollingMutation.mutate(input);
              } else if (selectedStrategy === 'blue-green') {
                blueGreenMutation.mutate(input);
              } else {
                canaryMutation.mutate(input);
              }
            }}
            disabled={rollingMutation.isPending || blueGreenMutation.isPending || canaryMutation.isPending}
          >
            {(rollingMutation.isPending || blueGreenMutation.isPending || canaryMutation.isPending) ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 mr-2" />
                Deploy with {strategies.find(s => s.id === selectedStrategy)?.name}
              </>
            )}
          </Button>
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
                className={`p-4 border rounded-lg ${
                  deployment.status === 'in-progress' ? 'border-blue-500/50' :
                  deployment.status === 'completed' ? 'border-green-500/50' :
                  deployment.status === 'failed' ? 'border-red-500/50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      deployment.strategy === 'rolling' ? 'bg-blue-100 dark:bg-blue-900/30' :
                      deployment.strategy === 'blue-green' ? 'bg-green-100 dark:bg-green-900/30' :
                      'bg-yellow-100 dark:bg-yellow-900/30'
                    }`}>
                      {deployment.strategy === 'rolling' && <RefreshCw className="h-5 w-5 text-blue-600" />}
                      {deployment.strategy === 'blue-green' && <Layers className="h-5 w-5 text-green-600" />}
                      {deployment.strategy === 'canary' && <Percent className="h-5 w-5 text-yellow-600" />}
                    </div>
                    <div>
                      <h4 className="font-medium capitalize">{deployment.strategy} Deployment</h4>
                      <p className="text-sm text-muted-foreground">
                        {deployment.versions?.current} → {deployment.versions?.new}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {deployment.trafficSplit && (
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Traffic Split</p>
                        <p className="font-medium">
                          {deployment.trafficSplit.current}% / {deployment.trafficSplit.new}%
                        </p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Status</p>
                      <span className={`inline-flex items-center gap-1 text-sm ${
                        deployment.status === 'in-progress' ? 'text-blue-500' :
                        deployment.status === 'completed' ? 'text-green-500' :
                        deployment.status === 'failed' ? 'text-red-500' :
                        'text-muted-foreground'
                      }`}>
                        {deployment.status === 'in-progress' && (
                          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        )}
                        {deployment.status === 'completed' && <CheckCircle className="h-4 w-4" />}
                        {deployment.status === 'failed' && <XCircle className="h-4 w-4" />}
                        {deployment.status}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {deployment.status === 'in-progress' && (
                        <>
                          <Button variant="outline" size="sm">
                            <Pause className="h-4 w-4 mr-1" />
                            Pause
                          </Button>
                          <Button variant="outline" size="sm" className="text-red-500">
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Rollback
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                
                {/* Progress bar for in-progress deployments */}
                {deployment.status === 'in-progress' && deployment.progress && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">{deployment.progress.currentPhase}</span>
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
          <div className="text-center py-12 border rounded-lg">
            <Rocket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Active Deployments</h3>
            <p className="text-muted-foreground mb-4">
              Select a strategy above to start a new deployment
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
