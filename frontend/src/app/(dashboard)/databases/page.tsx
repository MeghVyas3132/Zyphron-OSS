'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, Database, MoreHorizontal, ExternalLink, Clock, CheckCircle2, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/utils';
import { useDatabases } from '@/hooks/use-databases';
import { CreateDatabaseModal } from '@/components/databases/create-database-modal';
import type { DatabaseInstance } from '@/lib/api';
import { toast } from 'sonner';

type StatusKey = 'CREATING' | 'RUNNING' | 'STOPPED' | 'FAILED' | 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED' | 'ERROR';

const dbTypeConfig = {
  POSTGRESQL: { icon: 'PG', label: 'PostgreSQL' },
  MYSQL: { icon: 'MY', label: 'MySQL' },
  MONGODB: { icon: 'MG', label: 'MongoDB' },
  REDIS: { icon: 'RD', label: 'Redis' },
};

const statusConfig = {
  CREATING: { icon: Loader2, color: 'text-foreground/80', bg: 'bg-foreground/10', animate: true },
  RUNNING: { icon: CheckCircle2, color: 'text-foreground', bg: 'bg-foreground/15' },
  STOPPED: { icon: Clock, color: 'text-foreground/70', bg: 'bg-foreground/5' },
  FAILED: { icon: Database, color: 'text-foreground/60', bg: 'bg-foreground/5' },
  PROVISIONING: { icon: Loader2, color: 'text-foreground/80', bg: 'bg-foreground/10', animate: true },
  ACTIVE: { icon: CheckCircle2, color: 'text-foreground', bg: 'bg-foreground/15' },
  SUSPENDED: { icon: Clock, color: 'text-foreground/70', bg: 'bg-foreground/5' },
  DELETED: { icon: Database, color: 'text-foreground/60', bg: 'bg-foreground/5' },
  ERROR: { icon: AlertCircle, color: 'text-foreground/60', bg: 'bg-foreground/5' },
} satisfies Record<StatusKey, { icon: React.ElementType; color: string; bg: string; animate?: boolean }>;

export default function DatabasesPage() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(searchParams.get('new') === '1');
  const { data, isLoading, isError, error, refetch } = useDatabases();

  const databases = Array.isArray(data?.data) ? data.data : [];
  
  const filteredDatabases = databases.filter(
    (db) =>
      db.name.toLowerCase().includes(search.toLowerCase()) ||
      db.slug.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">
          {error instanceof Error ? error.message : 'Failed to load databases'}
        </p>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between stagger-in">
        <div>
          <h1 className="text-3xl font-semibold mono-text-gradient">Databases</h1>
          <p className="text-muted-foreground mt-1">
            Provision and manage your databases
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            New Database
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="premium-panel p-3 max-w-md stagger-in animate-delay-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search databases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 rounded-xl"
          />
        </div>
      </div>

      {/* Databases List */}
      {filteredDatabases.length === 0 ? (
        <div className="premium-panel text-center py-14 stagger-in animate-delay-2">
          <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            {search ? 'No databases found matching your search' : 'No databases yet'}
          </p>
          {!search && (
            <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
              Create Your First Database
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredDatabases.map((db) => (
            <DatabaseCard key={db.id} database={db} />
          ))}
        </div>
      )}

      {/* Create Database Modal */}
      <CreateDatabaseModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}

function DatabaseCard({ database }: { database: DatabaseInstance }) {
  const typeConfig = dbTypeConfig[database.type] ?? dbTypeConfig.POSTGRESQL;
  const statusCfg = statusConfig[database.status as StatusKey] ?? statusConfig.PROVISIONING;
  const StatusIcon = statusCfg.icon;
  const storageTotal = database.storage?.total ?? database.storageGb ?? 1;
  const storageUsed = database.storage?.used ?? 0;
  const storagePercent = storageTotal > 0 ? (storageUsed / storageTotal) * 100 : 0;

  const copyConnectionString = async () => {
    if (!database.connectionString) {
      toast.info('Connection string is available inside the database detail page.');
      return;
    }
    try {
      await navigator.clipboard.writeText(database.connectionString);
      toast.success('Connection string copied.');
    } catch {
      toast.error('Failed to copy connection string.');
    }
  };

  return (
    <div className="premium-panel premium-card-hover p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-foreground/10 border border-foreground/15 flex items-center justify-center">
            <span className="text-xs tracking-wider font-semibold">{typeConfig.icon}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{database.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color} flex items-center gap-1`}>
                    <StatusIcon className={`h-3 w-3 ${'animate' in statusCfg && statusCfg.animate ? 'animate-spin' : ''}`} />
                    {database.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
              {typeConfig.label} {database.version}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">Host</p>
          <p className="font-mono text-sm truncate">{database.host}:{database.port}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Database</p>
          <p className="font-mono text-sm">{database.databaseName || database.name}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Created</p>
          <p className="text-sm">{formatRelativeTime(database.createdAt)}</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border/70">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">Storage</span>
          <span className="font-medium">{storageUsed} GB / {storageTotal} GB</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              storagePercent > 80 ? 'bg-foreground/90' : storagePercent > 60 ? 'bg-foreground/70' : 'bg-foreground/50'
            }`}
            style={{ width: `${storagePercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Link href={`/databases/${database.id}`}>
          <Button variant="outline" size="sm">
            Manage
          </Button>
        </Link>
        <Button variant="ghost" size="sm" className="gap-1" onClick={copyConnectionString}>
          <ExternalLink className="h-3 w-3" />
          Connection String
        </Button>
      </div>
    </div>
  );
}
