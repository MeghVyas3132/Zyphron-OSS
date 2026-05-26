'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Layers, GitBranch, Server, Database, Cpu, ArrowRight,
  CheckCircle2, Clock, XCircle, Loader2, RefreshCw,
  ChevronDown, ChevronUp, ExternalLink, Zap,
  Activity, Box, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

// ─── Types ────────────────────────────────────────────────────

interface ServiceProject {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  composeServiceName: string | null;
  deployments: Array<{
    id: string;
    status: string;
    createdAt: string;
    url: string | null;
  }>;
}

interface ComposeGroup {
  id: string;
  name: string;
  repositoryUrl: string;
  composeFile: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
  manifest: Record<string, unknown> | null;
  projects: ServiceProject[];
}

// ─── Helpers ─────────────────────────────────────────────────

function getToken() {
  return typeof window !== 'undefined' ? (localStorage.getItem('auth-token') ?? '') : '';
}

async function fetchGroups(): Promise<ComposeGroup[]> {
  const res = await fetch(`${API}/api/v1/projects/compose-groups`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data?.groups ?? [];
}

function deploymentStatus(project: ServiceProject): { label: string; color: string; icon: React.ElementType } {
  const dep = project.deployments[0];
  if (!dep) return { label: 'Not deployed', color: 'text-muted-foreground', icon: Clock };
  const map: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    LIVE:      { label: 'Live',      color: 'text-emerald-400', icon: CheckCircle2 },
    BUILDING:  { label: 'Building',  color: 'text-blue-400',    icon: Loader2 },
    DEPLOYING: { label: 'Deploying', color: 'text-blue-400',    icon: Loader2 },
    FAILED:    { label: 'Failed',    color: 'text-red-400',     icon: XCircle },
    QUEUED:    { label: 'Queued',    color: 'text-yellow-400',  icon: Clock },
    CANCELLED: { label: 'Cancelled', color: 'text-muted-foreground', icon: XCircle },
  };
  return map[dep.status] ?? { label: dep.status, color: 'text-muted-foreground', icon: Activity };
}

function serviceKindIcon(name: string): React.ElementType {
  const n = name.toLowerCase();
  if (/worker|celery|sidekiq/.test(n)) return Cpu;
  if (/redis|cache/.test(n)) return Activity;
  if (/db|database|postgres|mysql|mongo/.test(n)) return Database;
  if (/nginx|proxy|gateway/.test(n)) return ArrowRight;
  if (/frontend|web|client|ui/.test(n)) return Box;
  return Server;
}

function repoName(url: string) {
  return url.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '');
}

// ─── Service node card ────────────────────────────────────────

function ServiceNode({ project, index }: { project: ServiceProject; index: number }) {
  const status = deploymentStatus(project);
  const Icon = serviceKindIcon(project.composeServiceName ?? project.name);
  const StatusIcon = status.icon;
  const dep = project.deployments[0];
  const protocol = process.env.NEXT_PUBLIC_APP_URL?.startsWith('https') ? 'https' : 'http';
  const baseDomain = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost').replace(/^https?:\/\//, '');
  const liveUrl = dep?.url ?? `${protocol}://${project.subdomain}.${baseDomain}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="relative group"
    >
      {/* Connector line (not for first) */}
      {index > 0 && (
        <div className="absolute -left-6 top-1/2 w-6 h-px bg-border/60" />
      )}

      <div className="rounded-2xl border bg-card/70 backdrop-blur-sm p-4 w-52 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
        {/* Service icon + name */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{project.name}</p>
            <p className="text-xs text-white/40 truncate uppercase tracking-[0.18em]">
              service: {project.composeServiceName || 'app'}
            </p>
          </div>
        </div>

        {/* Status */}
        <div className={`flex items-center gap-1.5 text-xs font-medium ${status.color} mb-3`}>
          <StatusIcon className={`h-3.5 w-3.5 ${status.label === 'Building' || status.label === 'Deploying' ? 'animate-spin' : ''}`} />
          {status.label}
          {dep && <span className="text-white/35 font-normal ml-1">{formatRelativeTime(dep.createdAt)}</span>}
        </div>

        {/* Links */}
        <div className="flex gap-1.5">
          <Link
            href={`/projects/${project.id}`}
            className="flex-1 text-center text-xs py-1.5 rounded-lg border border-border/60 hover:bg-accent/60 transition-colors"
          >
            Settings
          </Link>
          {dep?.status === 'LIVE' && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg border border-border/60 hover:bg-accent/60 transition-colors"
              title="Open live URL"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Stack card ───────────────────────────────────────────────

function StackCard({ group }: { group: ComposeGroup }) {
  const [expanded, setExpanded] = useState(true);

  const liveCount  = group.projects.filter(p => p.deployments[0]?.status === 'LIVE').length;
  const failCount  = group.projects.filter(p => p.deployments[0]?.status === 'FAILED').length;
  const buildCount = group.projects.filter(p => ['BUILDING', 'DEPLOYING', 'QUEUED'].includes(p.deployments[0]?.status ?? '')).length;
  const totalCount = group.projects.length;

  const stackHealth =
    liveCount === totalCount ? 'healthy'
    : failCount > 0 ? 'degraded'
    : buildCount > 0 ? 'deploying'
    : 'partial';

  const healthConfig = {
    healthy:   { label: 'All services live', color: 'text-emerald-400', dot: 'bg-emerald-400' },
    degraded:  { label: `${failCount} service${failCount > 1 ? 's' : ''} failed`, color: 'text-red-400', dot: 'bg-red-400' },
    deploying: { label: 'Deploying…', color: 'text-blue-400', dot: 'bg-blue-400 animate-pulse' },
    partial:   { label: `${liveCount}/${totalCount} live`, color: 'text-yellow-400', dot: 'bg-yellow-400' },
  }[stackHealth];

  return (
    <motion.div
      layout
      className="rounded-2xl border bg-card/50 backdrop-blur-sm overflow-hidden"
    >
      {/* Stack header */}
      <div
        className="p-5 flex items-start gap-4 cursor-pointer hover:bg-accent/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="p-3 rounded-xl bg-primary/10 text-primary flex-shrink-0 mt-0.5">
          <Layers className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-bold text-lg">{group.name}</h3>
            <span className={`flex items-center gap-1.5 text-xs font-medium ${healthConfig.color}`}>
              <span className={`h-2 w-2 rounded-full ${healthConfig.dot}`} />
              {healthConfig.label}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <a
              href={group.repositoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <GitBranch className="h-3.5 w-3.5" />
              {repoName(group.repositoryUrl)}
            </a>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-sm text-muted-foreground">{group.branch}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-xs text-muted-foreground">{group.composeFile}</span>
          </div>

          {/* Service count pills */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-foreground/8 text-xs text-muted-foreground border border-border/50">
              {totalCount} service{totalCount !== 1 ? 's' : ''}
            </span>
            {liveCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20">
                {liveCount} live
              </span>
            )}
            {buildCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">
                {buildCount} deploying
              </span>
            )}
            {failCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs border border-red-500/20">
                {failCount} failed
              </span>
            )}
            <span className="text-xs text-muted-foreground/60 ml-auto">
              Created {formatRelativeTime(group.createdAt)}
            </span>
          </div>
        </div>

        <button className="p-2 rounded-lg hover:bg-accent/40 text-muted-foreground transition-colors flex-shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Services graph */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="px-5 pb-6 border-t border-border/40">
              <p className="text-xs text-muted-foreground mt-4 mb-4 uppercase tracking-wider font-medium">Services</p>

              {/* Visual service graph */}
              <div className="relative">
                {/* Connection lines background */}
                <div className="absolute inset-0 pointer-events-none">
                  <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    {group.projects.slice(1).map((_, i) => (
                      <line
                        key={i}
                        x1={`${(i / (group.projects.length - 1)) * 100}%`}
                        y1="50%"
                        x2={`${((i + 1) / (group.projects.length - 1)) * 100}%`}
                        y2="50%"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                        className="text-border/60"
                      />
                    ))}
                  </svg>
                </div>

                {/* Service cards in a row */}
                <div className="flex items-stretch gap-3 flex-wrap">
                  {group.projects.map((project, i) => (
                    <ServiceNode key={project.id} project={project} index={i} />
                  ))}

                  {/* Empty state if no services yet */}
                  {group.projects.length === 0 && (
                    <div className="flex items-center gap-3 py-6 text-muted-foreground text-sm">
                      <Server className="h-5 w-5" />
                      No services deployed yet
                    </div>
                  )}
                </div>
              </div>

              {/* Dependency arrows legend */}
              {group.projects.length > 1 && (
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/60">
                  <div className="w-6 h-px border-t border-dashed border-border/60" />
                  <span>service connections</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function StacksPage() {
  const qc = useQueryClient();

  const { data: groups = [], isLoading, error } = useQuery({
    queryKey: ['compose-groups'],
    queryFn: fetchGroups,
    refetchInterval: 15_000,
  });

  return (
    <div className="min-h-screen p-6 lg:p-10 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
          <Layers className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compose Stacks</h1>
          <p className="text-muted-foreground mt-0.5">Multi-service Docker Compose deployments</p>
        </div>
        <div className="ml-auto flex gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => qc.invalidateQueries({ queryKey: ['compose-groups'] })}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Link href="/projects/new?mode=compose">
            <Button size="sm" className="gap-2">
              <Zap className="h-4 w-4" />
              Deploy Stack
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 flex items-center gap-3 text-red-400">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">Failed to load stacks. Make sure you are signed in.</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && groups.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-dashed border-border/60 p-16 text-center"
        >
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <Layers className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No stacks deployed yet</h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
            Deploy a repo with a <code className="font-mono text-xs bg-accent/60 px-1.5 py-0.5 rounded">docker-compose.yml</code> and Zyphron will automatically detect and wire all your services together.
          </p>
          <Link href="/projects/new?mode=compose">
            <Button className="gap-2">
              <Zap className="h-4 w-4" />
              Deploy your first stack
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Stack cards */}
      {!isLoading && groups.length > 0 && (
        <div className="space-y-5">
          {groups.map(group => (
            <StackCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
