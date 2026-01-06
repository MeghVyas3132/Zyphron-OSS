'use client';

import { useState } from 'react';
import { Key, Trash2, Copy, Check, Plus, Eye, EyeOff, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApiKeys, useCreateApiKey, useDeleteApiKey, type CreatedApiKey, type ApiKey } from '@/hooks/use-api-keys';

export function ApiKeysSection() {
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState<string>('90');
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useApiKeys();
  const createApiKey = useCreateApiKey();
  const deleteApiKey = useDeleteApiKey();

  const apiKeys = data?.apiKeys || [];

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;

    try {
      const key = await createApiKey.mutateAsync({
        name: newKeyName,
        expiresInDays: newKeyExpiry ? parseInt(newKeyExpiry) : undefined,
      });
      setCreatedKey(key);
      setNewKeyName('');
      setNewKeyExpiry('90');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create API key:', error);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }
    await deleteApiKey.mutateAsync(keyId);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const getExpiryStatus = (expiresAt?: string) => {
    if (!expiresAt) return { text: 'Never expires', color: 'text-muted-foreground' };
    const expiry = new Date(expiresAt);
    const now = new Date();
    const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) return { text: 'Expired', color: 'text-red-500' };
    if (daysUntil < 7) return { text: `Expires in ${daysUntil} days`, color: 'text-yellow-500' };
    if (daysUntil < 30) return { text: `Expires in ${daysUntil} days`, color: 'text-orange-500' };
    return { text: `Expires ${formatDate(expiresAt)}`, color: 'text-muted-foreground' };
  };

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">API Keys</h3>
          <p className="text-sm text-muted-foreground">
            Use API keys to access Zyphron programmatically
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-4 w-4" />
            New Key
          </Button>
        </div>
      </div>

      {/* Create New Key Dialog */}
      {isCreating && (
        <div className="mb-4 p-4 rounded-lg border bg-muted/50 space-y-4">
          <h4 className="font-medium">Create New API Key</h4>
          
          <div className="space-y-2">
            <Label htmlFor="key-name">Key Name</Label>
            <Input
              id="key-name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g., Production CI/CD"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="key-expiry">Expiration (days)</Label>
            <select
              id="key-expiry"
              value={newKeyExpiry}
              onChange={(e) => setNewKeyExpiry(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
              <option value="">Never expires</option>
            </select>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCreate}
              disabled={!newKeyName.trim() || createApiKey.isPending}
            >
              {createApiKey.isPending ? 'Creating...' : 'Create Key'}
            </Button>
            <Button variant="outline" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Show Created Key */}
      {createdKey && (
        <div className="mb-4 p-4 rounded-lg border border-green-500/50 bg-green-500/10 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-green-600">API Key Created</h4>
              <p className="text-sm text-muted-foreground">
                Make sure to copy your API key now. You won&apos;t be able to see it again!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-md bg-background border font-mono text-sm">
            <code className="flex-1 break-all">{createdKey.key}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(createdKey.key, 'created')}
            >
              {copiedId === 'created' ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={() => setCreatedKey(null)}>
            Done
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && apiKeys.length === 0 && !createdKey && (
        <div className="text-center py-8">
          <Key className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No API keys generated yet.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            API keys allow you to access Zyphron from CI/CD pipelines and scripts.
          </p>
        </div>
      )}

      {/* API Keys List */}
      {!isLoading && apiKeys.length > 0 && (
        <div className="space-y-3">
          {apiKeys.map((key: ApiKey) => {
            const expiryStatus = getExpiryStatus(key.expiresAt);
            const expired = isExpired(key.expiresAt);

            return (
              <div
                key={key.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  expired ? 'border-red-500/30 bg-red-500/5' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <Key className={`h-5 w-5 ${expired ? 'text-red-500' : 'text-muted-foreground'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{key.name}</p>
                      {expired && (
                        <span className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-500">
                          Expired
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <code className="text-xs bg-muted px-1 rounded">zk_{key.prefix}_...</code>
                      <span>•</span>
                      <span className={expiryStatus.color}>{expiryStatus.text}</span>
                      {key.lastUsedAt && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Used {formatDate(key.lastUsedAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(key.id)}
                  disabled={deleteApiKey.isPending}
                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Usage Info */}
      <div className="mt-6 p-4 rounded-lg bg-muted/50">
        <h4 className="text-sm font-medium mb-2">Using API Keys</h4>
        <p className="text-xs text-muted-foreground mb-2">
          Include your API key in the Authorization header:
        </p>
        <code className="block text-xs bg-background p-2 rounded border overflow-x-auto">
          Authorization: Bearer zk_your_api_key_here
        </code>
      </div>
    </div>
  );
}
