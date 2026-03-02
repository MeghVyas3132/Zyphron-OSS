'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Database, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDatabase, useDatabaseConnection, useDeleteDatabase } from '@/hooks/use-databases';

export default function DatabaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const databaseId = params.databaseId as string;

  const { data, isLoading, isError, error, refetch } = useDatabase(databaseId);
  const { data: connectionData, refetch: refetchConnection } = useDatabaseConnection(databaseId);
  const deleteDatabase = useDeleteDatabase();

  const database = data?.data;
  const connectionString =
    connectionData?.data?.connectionString ||
    (connectionData?.data as { connectionString?: string })?.connectionString ||
    '';

  const handleCopy = async () => {
    if (!connectionString) {
      toast.info('Connection string not available yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(connectionString);
      toast.success('Connection string copied.');
    } catch {
      toast.error('Failed to copy connection string.');
    }
  };

  const handleDelete = async () => {
    if (!database) return;
    if (!confirm(`Delete database "${database.name}"?`)) return;

    try {
      await deleteDatabase.mutateAsync(database.id);
      toast.success('Database deleted.');
      router.push('/databases');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete database.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isError || !database) {
    return (
      <div className="space-y-4">
        <Link href="/databases">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <div className="premium-panel p-6">
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : 'Unable to load database details.'}
          </p>
          <Button className="mt-4 gap-2" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/databases">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-semibold mono-text-gradient">{database.name}</h1>
            <p className="text-muted-foreground mt-1">
              {database.type} {database.version}
            </p>
          </div>
        </div>
        <Button variant="destructive" className="gap-2" onClick={handleDelete} disabled={deleteDatabase.isPending}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>

      <div className="premium-panel p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          <h2 className="font-semibold">Connection</h2>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 font-mono text-xs break-all">
          {connectionString || 'Connection string unavailable'}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleCopy}>
            <Copy className="h-4 w-4" />
            Copy
          </Button>
          <Button variant="ghost" className="gap-2" onClick={() => refetchConnection()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="premium-panel p-6">
        <h2 className="font-semibold mb-3">Metadata</h2>
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          <div>
            <p className="text-muted-foreground">Status</p>
            <p>{database.status}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Host</p>
            <p>{database.host || 'N/A'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Port</p>
            <p>{database.port || 'N/A'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Username</p>
            <p>{database.username || 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

