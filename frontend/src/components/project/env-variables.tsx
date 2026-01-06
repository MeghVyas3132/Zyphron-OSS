'use client';

import { useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEnvVars, useSetEnvVars, useDeleteEnvVar } from '@/hooks/use-env';

interface EnvVariablesProps {
  projectId: string;
  projectSlug: string;
}

export function EnvVariables({ projectId, projectSlug }: EnvVariablesProps) {
  const { data, isLoading, error, refetch } = useEnvVars(projectSlug);
  const setEnvVarsMutation = useSetEnvVars(projectSlug);
  const deleteEnvVarMutation = useDeleteEnvVar(projectSlug);
  
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  
  const envVars = data?.data || [];

  const handleAddVariable = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    
    try {
      await setEnvVarsMutation.mutateAsync([{ key: newKey.toUpperCase(), value: newValue }]);
      setNewKey('');
      setNewValue('');
    } catch (error) {
      console.error('Failed to add env var:', error);
    }
  };

  const handleDeleteVariable = async (key: string) => {
    if (!confirm(`Delete environment variable "${key}"?`)) return;
    
    try {
      await deleteEnvVarMutation.mutateAsync(key);
    } catch (error) {
      console.error('Failed to delete env var:', error);
    }
  };

  const toggleShowValue = (key: string) => {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Failed to load environment variables</p>
        <Button onClick={() => refetch()} variant="outline" size="sm">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add new variable */}
      <div className="p-4 border rounded-lg space-y-4">
        <h3 className="font-medium">Add New Variable</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="key">Key</Label>
            <Input
              id="key"
              placeholder="MY_ENV_VAR"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="value">Value</Label>
            <Input
              id="value"
              type="password"
              placeholder="Enter value..."
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          </div>
        </div>
        <Button 
          onClick={handleAddVariable} 
          disabled={!newKey.trim() || !newValue.trim() || setEnvVarsMutation.isPending}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Variable
        </Button>
      </div>

      {/* Existing variables */}
      <div className="space-y-2">
        <h3 className="font-medium">Environment Variables ({envVars.length})</h3>
        
        {envVars.length === 0 ? (
          <div className="p-8 border rounded-lg text-center text-muted-foreground">
            No environment variables configured yet.
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {envVars.map((envVar: { key: string; value: string; environment?: string; isSecret?: boolean }) => (
              <div key={envVar.key} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-medium text-sm">{envVar.key}</div>
                  <div className="font-mono text-sm text-muted-foreground truncate">
                    {showValues[envVar.key] ? envVar.value : '••••••••••••'}
                  </div>
                  {envVar.environment && (
                    <span className="text-xs bg-secondary px-2 py-0.5 rounded mt-1 inline-block">
                      {envVar.environment}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleShowValue(envVar.key)}
                    title={showValues[envVar.key] ? 'Hide value' : 'Show value'}
                  >
                    {showValues[envVar.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(envVar.value, envVar.key)}
                    title="Copy value"
                  >
                    {copied === envVar.key ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteVariable(envVar.key)}
                    disabled={deleteEnvVarMutation.isPending}
                    className="text-destructive hover:text-destructive"
                    title="Delete variable"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import from .env */}
      <div className="p-4 border rounded-lg bg-muted/50">
        <h4 className="font-medium text-sm mb-2">Import from .env file</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Paste your .env file contents to bulk import variables.
        </p>
        <textarea
          placeholder="DATABASE_URL=postgresql://...&#10;API_KEY=sk_..."
          className="w-full h-24 p-2 text-sm font-mono bg-background border rounded resize-none"
        />
        <Button variant="outline" size="sm" className="mt-2">
          Import Variables
        </Button>
      </div>
    </div>
  );
}
