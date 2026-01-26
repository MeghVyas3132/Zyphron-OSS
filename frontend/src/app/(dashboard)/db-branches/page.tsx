'use client';

import { useState } from 'react';
import { 
  GitBranch, 
  Plus, 
  RefreshCw, 
  Database,
  GitMerge,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trash2,
  Settings,
  Clock,
  Copy,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  useDatabaseBranches, 
  useCreateDatabaseBranch,
  useSyncDatabaseBranch,
  useMergeDatabaseBranch,
  useDatabaseBranchConnection
} from '@/hooks/use-db-branching';

export default function DBBranchesPage() {
  const [selectedProjectId] = useState('default');
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const { data: branches, isLoading, refetch } = useDatabaseBranches(selectedProjectId);
  const createMutation = useCreateDatabaseBranch();

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
            <GitBranch className="h-8 w-8" />
            Database Branches
          </h1>
          <p className="text-muted-foreground mt-1">
            Create isolated database branches for development and preview environments
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            Create Branch
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <GitBranch className="h-4 w-4" />
            <span className="text-sm">Active Branches</span>
          </div>
          <p className="text-2xl font-bold">
            {branches?.filter(b => b.status === 'active').length || 0}
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Database className="h-4 w-4" />
            <span className="text-sm">Total Size</span>
          </div>
          <p className="text-2xl font-bold">
            {((branches?.reduce((acc, b) => acc + (b.size || 0), 0) || 0) / 1024 / 1024).toFixed(1)} GB
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <GitMerge className="h-4 w-4" />
            <span className="text-sm">Pending Merges</span>
          </div>
          <p className="text-2xl font-bold">2</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Expiring Soon</span>
          </div>
          <p className="text-2xl font-bold text-yellow-500">
            {branches?.filter(b => b.expiresAt && new Date(b.expiresAt) < new Date(Date.now() + 24 * 60 * 60 * 1000)).length || 0}
          </p>
        </div>
      </div>

      {/* Branch Visualization */}
      <div className="p-6 border rounded-lg bg-muted/30">
        <h3 className="font-semibold mb-4">Branch Tree</h3>
        <div className="flex items-start gap-4 overflow-x-auto pb-4">
          {/* Main branch */}
          <div className="flex flex-col items-center min-w-[150px]">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
              <Database className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="h-8 w-0.5 bg-primary" />
            <span className="text-sm font-medium mt-2">main</span>
            <span className="text-xs text-muted-foreground">Production</span>
          </div>
          
          {/* Child branches */}
          <div className="flex gap-8 pt-12">
            {(branches || []).slice(0, 4).map((branch, i) => (
              <div key={branch.id} className="flex flex-col items-center min-w-[120px]">
                <div className="h-0.5 w-8 bg-muted-foreground/30 mb-2" />
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                  branch.status === 'active' ? 'bg-green-100 dark:bg-green-900/30' :
                  branch.status === 'syncing' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                  'bg-muted'
                }`}>
                  <GitBranch className={`h-5 w-5 ${
                    branch.status === 'active' ? 'text-green-600' :
                    branch.status === 'syncing' ? 'text-yellow-600' :
                    'text-muted-foreground'
                  }`} />
                </div>
                <span className="text-sm font-medium mt-2 truncate max-w-[100px]">{branch.name}</span>
                <span className="text-xs text-muted-foreground">{branch.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Branches List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">All Branches</h2>
        {branches && branches.length > 0 ? (
          <div className="space-y-3">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="p-4 border rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      branch.status === 'active' ? 'bg-green-100 dark:bg-green-900/30' :
                      branch.status === 'syncing' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                      branch.status === 'error' ? 'bg-red-100 dark:bg-red-900/30' :
                      'bg-muted'
                    }`}>
                      <GitBranch className={`h-5 w-5 ${
                        branch.status === 'active' ? 'text-green-600' :
                        branch.status === 'syncing' ? 'text-yellow-600' :
                        branch.status === 'error' ? 'text-red-600' :
                        'text-muted-foreground'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{branch.name}</h4>
                        {branch.metadata?.pullRequestId && (
                          <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded">
                            PR #{branch.metadata.pullRequestId}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {branch.type} • Created from {branch.parentBranchId ? 'branch' : 'main'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Size</p>
                      <p className="font-medium">{((branch.size || 0) / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Status</p>
                      <span className={`inline-flex items-center gap-1 text-sm ${
                        branch.status === 'active' ? 'text-green-500' :
                        branch.status === 'syncing' ? 'text-yellow-500' :
                        branch.status === 'error' ? 'text-red-500' :
                        'text-muted-foreground'
                      }`}>
                        <div className={`h-2 w-2 rounded-full ${
                          branch.status === 'active' ? 'bg-green-500' :
                          branch.status === 'syncing' ? 'bg-yellow-500 animate-pulse' :
                          branch.status === 'error' ? 'bg-red-500' :
                          'bg-muted-foreground'
                        }`} />
                        {branch.status}
                      </span>
                    </div>
                    {branch.expiresAt && (
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Expires</p>
                        <p className="font-medium text-sm">
                          {new Date(branch.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <ArrowDownToLine className="h-4 w-4 mr-1" />
                        Pull
                      </Button>
                      <Button variant="outline" size="sm">
                        <GitMerge className="h-4 w-4 mr-1" />
                        Merge
                      </Button>
                      <Button variant="outline" size="sm">
                        <Copy className="h-4 w-4 mr-1" />
                        Connection
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                {branch.metadata?.previewUrl && (
                  <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={branch.metadata.previewUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {branch.metadata.previewUrl}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <GitBranch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Database Branches</h3>
            <p className="text-muted-foreground mb-4">
              Create branches to isolate database changes for development
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Branch
            </Button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg w-full max-w-lg">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Create Database Branch</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                ✕
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Branch Name</label>
                <Input placeholder="e.g., feature-user-auth" />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Source Database</label>
                <select className="w-full px-3 py-2 border rounded-lg bg-background">
                  <option value="main">main (Production)</option>
                  <option value="staging">staging</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Database Type</label>
                <select className="w-full px-3 py-2 border rounded-lg bg-background">
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="mongodb">MongoDB</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Expiration (Optional)</label>
                <Input type="date" />
                <p className="text-xs text-muted-foreground mt-1">
                  Branch will be automatically deleted after this date
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button>
                  <GitBranch className="h-4 w-4 mr-2" />
                  Create Branch
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
