'use client';

import { useState } from 'react';
import { Plus, Trash2, Globe, CheckCircle2, AlertTriangle, Loader2, ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDomains, useAddDomain, useDeleteDomain, useVerifyDomain } from '@/hooks/use-domains';

interface DomainsProps {
  projectId: string;
  subdomain: string;
}

export function Domains({ projectId, subdomain }: DomainsProps) {
  const { data, isLoading, error, refetch } = useDomains(projectId);
  const addDomainMutation = useAddDomain(projectId);
  const deleteDomainMutation = useDeleteDomain(projectId);
  const verifyDomainMutation = useVerifyDomain(projectId);
  
  const [newDomain, setNewDomain] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  
  const domains = data?.data?.domains || [];
  const primaryDomain = data?.data?.primaryDomain;
  const defaultSubdomain = data?.data?.subdomain || `${subdomain}.localhost`;

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;
    
    try {
      await addDomainMutation.mutateAsync(newDomain);
      setNewDomain('');
    } catch (error) {
      console.error('Failed to add domain:', error);
    }
  };

  const handleDeleteDomain = async (domainId: string, domainName: string) => {
    if (!confirm(`Remove domain "${domainName}"?`)) return;
    
    try {
      await deleteDomainMutation.mutateAsync(domainId);
    } catch (error) {
      console.error('Failed to delete domain:', error);
    }
  };

  const handleVerifyDomain = async (domainId: string) => {
    try {
      await verifyDomainMutation.mutateAsync(domainId);
    } catch (error) {
      console.error('Failed to verify domain:', error);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const sslStatusConfig: Record<string, { color: string; label: string; icon: React.ElementType }> = {
    pending: { color: 'text-yellow-500', label: 'Pending', icon: AlertTriangle },
    provisioning: { color: 'text-blue-500', label: 'Provisioning', icon: Loader2 },
    active: { color: 'text-green-500', label: 'Active', icon: CheckCircle2 },
    failed: { color: 'text-red-500', label: 'Failed', icon: AlertTriangle },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Default subdomain */}
      <div className="p-4 border rounded-lg">
        <h3 className="font-medium mb-3">Default Domain</h3>
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <a
            href={`https://${defaultSubdomain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm hover:text-primary flex items-center gap-1"
          >
            {defaultSubdomain}
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded">
            Active
          </span>
        </div>
      </div>

      {/* Add custom domain */}
      <div className="p-4 border rounded-lg space-y-4">
        <h3 className="font-medium">Add Custom Domain</h3>
        <div className="flex gap-2">
          <Input
            placeholder="example.com"
            value={newDomain}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDomain(e.target.value)}
            className="flex-1 font-mono"
          />
          <Button 
            onClick={handleAddDomain} 
            disabled={!newDomain.trim() || addDomainMutation.isPending}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Domain
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          After adding your domain, you'll need to configure DNS records to point to our servers.
        </p>
      </div>

      {/* Custom domains list */}
      {domains.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Custom Domains ({domains.length})</h3>
          <div className="border rounded-lg divide-y">
            {domains.map((domain: { 
              id: string; 
              domain: string; 
              verified: boolean; 
              verificationToken: string;
              verificationMethod: string;
              sslStatus: string;
            }) => {
              const sslConfig = sslStatusConfig[domain.sslStatus] || sslStatusConfig.pending;
              const SslIcon = sslConfig.icon;
              
              return (
                <div key={domain.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                      <span className="font-mono text-sm">{domain.domain}</span>
                      {domain.verified ? (
                        <span className="flex items-center gap-1 text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded">
                          <CheckCircle2 className="h-3 w-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded">
                          <AlertTriangle className="h-3 w-3" />
                          Pending Verification
                        </span>
                      )}
                      <span className={`flex items-center gap-1 text-xs ${sslConfig.color}`}>
                        <SslIcon className="h-3 w-3" />
                        SSL: {sslConfig.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!domain.verified && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerifyDomain(domain.id)}
                          disabled={verifyDomainMutation.isPending}
                        >
                          Verify
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteDomain(domain.id, domain.domain)}
                        disabled={deleteDomainMutation.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* DNS Configuration */}
                  {!domain.verified && (
                    <div className="bg-muted/50 p-3 rounded text-sm space-y-2">
                      <p className="font-medium">DNS Configuration Required</p>
                      <p className="text-muted-foreground text-xs">
                        Add the following {domain.verificationMethod.toUpperCase()} record to verify ownership:
                      </p>
                      <div className="flex items-center gap-2 bg-background p-2 rounded font-mono text-xs">
                        <span className="text-muted-foreground">TXT</span>
                        <span>_zyphron-verification.{domain.domain}</span>
                        <span className="text-muted-foreground">=</span>
                        <span className="truncate flex-1">{domain.verificationToken}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(domain.verificationToken, domain.id)}
                        >
                          {copied === domain.id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
