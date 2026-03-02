'use client';

import { useState } from 'react';
import { 
  FlaskConical, 
  Plus, 
  RefreshCw, 
  Play,
  Pause,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  Trash2,
  BarChart3,
  Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  useChaosExperiments, 
  useCreateExperiment,
  useRunExperiment,
  useStopExperiment,
  useChaosResults
} from '@/hooks/use-chaos';

const experimentTypes = [
  { id: 'network-delay', name: 'Network Delay', description: 'Add latency to network requests', icon: '🌐' },
  { id: 'cpu-stress', name: 'CPU Stress', description: 'Increase CPU load', icon: '💻' },
  { id: 'memory-stress', name: 'Memory Stress', description: 'Consume memory resources', icon: '🧠' },
  { id: 'disk-fill', name: 'Disk Fill', description: 'Fill disk space', icon: '💾' },
  { id: 'container-kill', name: 'Container Kill', description: 'Kill containers randomly', icon: '🔪' },
  { id: 'dependency-failure', name: 'Dependency Failure', description: 'Simulate dependency failures', icon: '🔗' },
];

export default function ChaosPage() {
  const [selectedProjectId] = useState('default');
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const { data: experiments, isLoading, refetch } = useChaosExperiments(selectedProjectId);
  const createMutation = useCreateExperiment();
  const runMutation = useRunExperiment();

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
            <FlaskConical className="h-8 w-8" />
            Chaos Engineering
          </h1>
          <p className="text-muted-foreground mt-1">
            Test system resilience with controlled failure injection
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            New Experiment
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <FlaskConical className="h-4 w-4" />
            <span className="text-sm">Total Experiments</span>
          </div>
          <p className="text-2xl font-bold">{experiments?.length || 0}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Play className="h-4 w-4" />
            <span className="text-sm">Running</span>
          </div>
          <p className="text-2xl font-bold text-green-500">
            {experiments?.filter(e => e.status === 'running').length || 0}
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Success Rate</span>
          </div>
          <p className="text-2xl font-bold">87%</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">Scheduled</span>
          </div>
          <p className="text-2xl font-bold">
            {experiments?.filter(e => e.status === 'scheduled').length || 0}
          </p>
        </div>
      </div>

      {/* Experiment Types */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Experiment Types</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {experimentTypes.map((type) => (
            <div
              key={type.id}
              onClick={() => setShowCreateModal(true)}
              className="p-4 border rounded-lg cursor-pointer hover:border-primary transition-colors text-center"
            >
              <span className="text-2xl mb-2 block">{type.icon}</span>
              <h4 className="font-medium text-sm">{type.name}</h4>
              <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Experiments List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Experiments</h2>
        {experiments && experiments.length > 0 ? (
          <div className="space-y-3">
            {experiments.map((experiment) => (
              <div
                key={experiment.id}
                className={`p-4 border rounded-lg ${
                  experiment.status === 'running' ? 'border-green-500/50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      experiment.status === 'running' ? 'bg-green-100 dark:bg-green-900/30' :
                      experiment.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30' :
                      experiment.status === 'completed' ? 'bg-blue-100 dark:bg-blue-900/30' :
                      'bg-muted'
                    }`}>
                      <FlaskConical className={`h-5 w-5 ${
                        experiment.status === 'running' ? 'text-green-600' :
                        experiment.status === 'failed' ? 'text-red-600' :
                        experiment.status === 'completed' ? 'text-blue-600' :
                        'text-muted-foreground'
                      }`} />
                    </div>
                    <div>
                      <h4 className="font-medium">{experiment.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {experiment.type} • Target: {experiment.target || 'all services'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Duration</p>
                      <p className="font-medium">{experiment.duration || 60}s</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Status</p>
                      <span className={`inline-flex items-center gap-1 text-sm ${
                        experiment.status === 'running' ? 'text-green-500' :
                        experiment.status === 'failed' ? 'text-red-500' :
                        experiment.status === 'completed' ? 'text-blue-500' :
                        'text-muted-foreground'
                      }`}>
                        {experiment.status === 'running' && (
                          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        )}
                        {experiment.status}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {experiment.status === 'running' ? (
                        <Button variant="outline" size="sm" className="text-red-500">
                          <Pause className="h-4 w-4 mr-1" />
                          Stop
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm">
                          <Play className="h-4 w-4 mr-1" />
                          Run
                        </Button>
                      )}
                      <Button variant="outline" size="sm">
                        <BarChart3 className="h-4 w-4 mr-1" />
                        Results
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                {experiment.status === 'running' && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Progress</span>
                      <span>{experiment.progress || 45}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${experiment.progress || 45}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Chaos Experiments</h3>
            <p className="text-muted-foreground mb-4">
              Create experiments to test your system&apos;s resilience
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Experiment
            </Button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg w-full max-w-lg">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Create Chaos Experiment</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                ✕
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Experiment Name</label>
                <Input placeholder="e.g., Network latency test" />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Type</label>
                <select className="w-full px-3 py-2 border rounded-lg bg-background">
                  {experimentTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.icon} {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Target Service</label>
                <Input placeholder="Service name or 'all'" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Duration (seconds)</label>
                  <Input type="number" placeholder="60" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Intensity (%)</label>
                  <Input type="number" placeholder="50" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button>
                  <FlaskConical className="h-4 w-4 mr-2" />
                  Create Experiment
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
