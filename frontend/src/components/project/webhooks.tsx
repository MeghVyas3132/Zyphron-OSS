'use client';

import { useState } from 'react';
import { Plus, Trash2, RefreshCw, Webhook, Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWebhooks, useCreateWebhook, useDeleteWebhook, useRegenerateWebhookSecret } from '@/hooks/use-webhooks';

interface WebhooksProps {
  projectId: string;
}

const providerConfig = {
  GITHUB: { name: 'GitHub', icon: 'GitHub', color: 'text-gray-200' },
  GITLAB: { name: 'GitLab', icon: 'GitLab', color: 'text-orange-500' },
  BITBUCKET: { name: 'Bitbucket', icon: 'Bitbucket', color: 'text-blue-500' },
};

export function Webhooks({ projectId }: WebhooksProps) {
  const { data, isLoading, refetch } = useWebhooks(projectId);
  const createWebhookMutation = useCreateWebhook(projectId);
  const deleteWebhookMutation = useDeleteWebhook(projectId);
  const regenerateSecretMutation = useRegenerateWebhookSecret(projectId);
  
  const [copied, setCopied] = useState<string | null>(null);
  
  const webhooks = data?.webhooks || [];

  const handleCreateWebhook = async (provider: string) => {
    try {
      await createWebhookMutation.mutateAsync({
        provider,
        events: ['push', 'pull_request'],
      });
    } catch (error) {
      console.error('Failed to create webhook:', error);
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Delete this webhook configuration?')) return;
    
    try {
      await deleteWebhookMutation.mutateAsync(webhookId);
    } catch (error) {
      console.error('Failed to delete webhook:', error);
    }
  };

  const handleRegenerateSecret = async (webhookId: string) => {
    if (!confirm('Regenerate webhook secret? You will need to update your Git provider settings.')) return;
    
    try {
      await regenerateSecretMutation.mutateAsync(webhookId);
    } catch (error) {
      console.error('Failed to regenerate secret:', error);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  const availableProviders = ['GITHUB', 'GITLAB', 'BITBUCKET'].filter(
    p => !webhooks.some((w: { provider: string }) => w.provider === p)
  );

  return (
    <div className="space-y-6">
      {/* Configured webhooks */}
      {webhooks.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Configured Webhooks</h3>
          <div className="border rounded-lg divide-y">
            {webhooks.map((webhook: {
              id: string;
              provider: 'GITHUB' | 'GITLAB' | 'BITBUCKET';
              webhookId: string;
              secret: string;
              events: string[];
              isActive: boolean;
              webhookUrl?: string;
            }) => {
              const config = providerConfig[webhook.provider];
              
              return (
                <div key={webhook.id} className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{config.icon}</span>
                      <div>
                        <div className="font-medium">{config.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Events: {webhook.events.join(', ')}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        webhook.isActive 
                          ? 'bg-green-500/10 text-green-500' 
                          : 'bg-gray-500/10 text-gray-500'
                      }`}>
                        {webhook.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRegenerateSecret(webhook.id)}
                        disabled={regenerateSecretMutation.isPending}
                        title="Regenerate secret"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteWebhook(webhook.id)}
                        disabled={deleteWebhookMutation.isPending}
                        className="text-destructive hover:text-destructive"
                        title="Delete webhook"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Webhook URL and Secret */}
                  <div className="bg-muted/50 p-3 rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Webhook URL</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(webhook.webhookUrl || '', `url-${webhook.id}`)}
                      >
                        {copied === `url-${webhook.id}` ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <div className="font-mono text-xs bg-background p-2 rounded truncate">
                      {webhook.webhookUrl}
                    </div>
                    
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">Secret</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(webhook.secret, `secret-${webhook.id}`)}
                      >
                        {copied === `secret-${webhook.id}` ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <div className="font-mono text-xs bg-background p-2 rounded">
                      {webhook.secret}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add new webhook */}
      {availableProviders.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Add Git Provider Webhook</h3>
          <p className="text-sm text-muted-foreground">
            Connect a Git provider to enable automatic deployments on push.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {availableProviders.map((provider) => {
              const config = providerConfig[provider as keyof typeof providerConfig];
              return (
                <button
                  key={provider}
                  onClick={() => handleCreateWebhook(provider)}
                  disabled={createWebhookMutation.isPending}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-3"
                >
                  <span className="text-3xl">{config.icon}</span>
                  <div className="text-left">
                    <div className="font-medium">{config.name}</div>
                    <div className="text-xs text-muted-foreground">Click to configure</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Setup instructions */}
      <div className="p-4 border rounded-lg bg-muted/50">
        <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
          <Webhook className="h-4 w-4" />
          Setup Instructions
        </h4>
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Create a webhook in your Git provider's repository settings</li>
          <li>Use the Webhook URL provided above</li>
          <li>Set the content type to <code className="bg-background px-1 rounded">application/json</code></li>
          <li>Add the Secret for signature verification</li>
          <li>Select events: <code className="bg-background px-1 rounded">push</code> and <code className="bg-background px-1 rounded">pull_request</code></li>
        </ol>
      </div>
    </div>
  );
}
