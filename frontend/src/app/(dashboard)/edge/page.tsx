'use client';

import { useState } from 'react';
import { 
  Rocket, 
  Plus, 
  RefreshCw, 
  Play,
  Pause,
  Code,
  Globe,
  Clock,
  BarChart,
  Settings,
  Trash2,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  useEdgeFunctions, 
  useCreateEdgeFunction,
  useDeployEdgeFunction,
  useEdgeFunctionMetrics,
  useEdgeRegions
} from '@/hooks/use-edge';

export default function EdgePage() {
  const [selectedProjectId] = useState('default');
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const { data: functions, isLoading, refetch } = useEdgeFunctions(selectedProjectId);
  const { data: regions } = useEdgeRegions();
  const createMutation = useCreateEdgeFunction();

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
            Edge Functions
          </h1>
          <p className="text-muted-foreground mt-1">
            Deploy serverless functions at the edge with V8 isolates
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={() => setShowCodeEditor(true)}>
            <Plus className="h-4 w-4" />
            New Function
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Code className="h-4 w-4" />
            <span className="text-sm">Total Functions</span>
          </div>
          <p className="text-2xl font-bold">{functions?.length || 0}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Globe className="h-4 w-4" />
            <span className="text-sm">Regions</span>
          </div>
          <p className="text-2xl font-bold">{regions?.length || 0}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <BarChart className="h-4 w-4" />
            <span className="text-sm">Invocations (24h)</span>
          </div>
          <p className="text-2xl font-bold">1.2M</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Avg Latency</span>
          </div>
          <p className="text-2xl font-bold">12ms</p>
        </div>
      </div>

      {/* Functions List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Functions</h2>
        {functions && functions.length > 0 ? (
          <div className="space-y-3">
            {functions.map((fn) => (
              <div
                key={fn.id}
                className="p-4 border rounded-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Code className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-medium">{fn.name}</h4>
                      <p className="text-sm text-muted-foreground font-mono">
                        {fn.routes?.join(', ') || '/api/*'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`inline-flex items-center gap-1 text-sm ${
                      fn.status === 'active' ? 'text-green-500' : 'text-yellow-500'
                    }`}>
                      <div className={`h-2 w-2 rounded-full ${
                        fn.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                      }`} />
                      {fn.status}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        Logs
                      </Button>
                      <Button variant="outline" size="sm">
                        <BarChart className="h-4 w-4 mr-1" />
                        Metrics
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 pt-3 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">Runtime</p>
                    <p className="text-sm font-medium">{fn.runtime || 'v8-isolate'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Regions</p>
                    <p className="text-sm font-medium">{fn.regions?.length || 1} regions</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Timeout</p>
                    <p className="text-sm font-medium">{fn.timeout || 30}s</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Memory</p>
                    <p className="text-sm font-medium">{fn.memoryLimit || 128}MB</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <Rocket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Edge Functions</h3>
            <p className="text-muted-foreground mb-4">
              Create your first edge function to run code at the edge
            </p>
            <Button onClick={() => setShowCodeEditor(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Function
            </Button>
          </div>
        )}
      </div>

      {/* Available Regions */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Edge Regions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {(regions || [
            { id: 'iad1', name: 'Washington, D.C.', location: 'US East' },
            { id: 'sfo1', name: 'San Francisco', location: 'US West' },
            { id: 'lhr1', name: 'London', location: 'Europe' },
            { id: 'fra1', name: 'Frankfurt', location: 'Europe' },
            { id: 'sin1', name: 'Singapore', location: 'Asia' },
            { id: 'hnd1', name: 'Tokyo', location: 'Asia' },
          ]).map((region) => (
            <div key={region.id} className="p-3 border rounded-lg">
              <p className="font-medium text-sm">{region.name}</p>
              <p className="text-xs text-muted-foreground">{region.location}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Code Editor Modal would go here */}
      {showCodeEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Create Edge Function</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowCodeEditor(false)}>
                ✕
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <Input placeholder="Function name" />
              <Input placeholder="Route (e.g., /api/hello)" />
              <div className="h-64 border rounded-lg bg-muted/50 p-4 font-mono text-sm">
                <pre>{`export default {
  async fetch(request, env, ctx) {
    return new Response('Hello from the edge!', {
      headers: { 'content-type': 'text/plain' },
    });
  },
};`}</pre>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCodeEditor(false)}>
                  Cancel
                </Button>
                <Button>
                  <Rocket className="h-4 w-4 mr-2" />
                  Deploy Function
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
