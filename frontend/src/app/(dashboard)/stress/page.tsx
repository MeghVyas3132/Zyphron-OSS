'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Gauge,
  Play,
  CheckCircle2,
  XCircle,
  Zap,
  Clock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProjects } from '@/hooks/use-projects';
import type { Project } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

interface StressResult {
  success: boolean;
  targetUrl: string;
  config: { virtualUsers: number; durationSeconds: number; rampUpSeconds: number };
  summary: {
    totalRequests: number;
    failedRequests: number;
    requestRate: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    avgResponseTime: number;
    maxResponseTime: number;
    errorRate: number;
    dataReceived: string;
    passed: boolean;
    thresholds: Record<string, { passed: boolean; value: string }>;
  } | null;
  error?: string;
}

interface ProbeResult {
  reachable: boolean;
  responseTimeMs: number;
  statusCode?: number;
  url: string;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.19, 1, 0.22, 1] } },
};

export default function StressPage() {
  const { data: projectsData } = useProjects();
  const projects: Project[] = (() => {
    const d = projectsData?.data;
    if (Array.isArray(d)) return d;
    if (d && typeof d === 'object' && 'projects' in d) return (d as { projects: Project[] }).projects;
    return [];
  })();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [vus, setVus] = useState('10');
  const [duration, setDuration] = useState('30');
  const [ramp, setRamp] = useState('10');

  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<StressResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : '';
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const probe = async () => {
    if (!selectedProjectId) return;
    setProbing(true);
    setProbeResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${selectedProjectId}/stress/probe`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as ProbeResult & { error?: { message?: string } };
      if (!res.ok) throw new Error(data.error?.message || 'Probe failed');
      setProbeResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Probe failed');
    } finally {
      setProbing(false);
    }
  };

  const run = async () => {
    if (!selectedProjectId) return;
    setRunning(true);
    setResult(null);
    setError(null);
    setElapsed(0);

    const dur = Math.max(10, Math.min(300, parseInt(duration) || 30));
    const ticker = setInterval(() => setElapsed(prev => Math.min(prev + 1, dur)), 1000);

    try {
      const res = await fetch(`${API_URL}/api/v1/projects/${selectedProjectId}/stress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          virtualUsers: Math.max(1, Math.min(200, parseInt(vus) || 10)),
          durationSeconds: dur,
          rampUpSeconds: Math.max(0, Math.min(dur - 5, parseInt(ramp) || 10)),
        }),
      });
      const data = await res.json() as StressResult & { error?: { message?: string } };
      if (!res.ok) throw new Error((data as { error?: { message?: string } }).error?.message || 'Test failed');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      clearInterval(ticker);
      setRunning(false);
    }
  };

  // Build latency bar chart data from result
  const chartData = result?.summary ? [
    { label: 'avg', value: result.summary.avgResponseTime },
    { label: 'p50', value: result.summary.p50 },
    { label: 'p90', value: result.summary.p90 },
    { label: 'p95', value: result.summary.p95 },
    { label: 'p99', value: result.summary.p99 },
    { label: 'max', value: result.summary.maxResponseTime },
  ] : [];

  const dur = Math.max(10, parseInt(duration) || 30);
  const pct = running ? Math.round((elapsed / dur) * 100) : (result ? 100 : 0);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      {/* Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mono-text-gradient">Load Testing</h1>
          <p className="text-muted-foreground mt-1">Run k6 stress tests against your live deployments.</p>
        </div>
        <Gauge className="h-8 w-8 text-foreground/30" />
      </motion.div>

      {/* Config panel */}
      <motion.div variants={item} className="premium-panel p-6 space-y-6">
        <h2 className="font-semibold text-sm uppercase tracking-[0.14em] text-muted-foreground">Test Configuration</h2>

        {/* Project select */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Target Project</label>
          <select
            value={selectedProjectId}
            onChange={e => { setSelectedProjectId(e.target.value); setProbeResult(null); setResult(null); }}
            className="w-full h-11 rounded-xl border border-input bg-card/80 px-3 text-sm outline-none focus:border-foreground/35 transition-colors"
          >
            <option value="">— select a project —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>
            ))}
          </select>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Virtual Users</label>
            <Input
              type="number"
              min={1} max={200}
              value={vus}
              onChange={e => setVus(e.target.value)}
              className="rounded-xl"
              placeholder="10"
            />
            <p className="text-xs text-muted-foreground">Concurrent users (max 200)</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Duration (s)</label>
            <Input
              type="number"
              min={10} max={300}
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className="rounded-xl"
              placeholder="30"
            />
            <p className="text-xs text-muted-foreground">Test duration in seconds</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Ramp-up (s)</label>
            <Input
              type="number"
              min={0} max={60}
              value={ramp}
              onChange={e => setRamp(e.target.value)}
              className="rounded-xl"
              placeholder="10"
            />
            <p className="text-xs text-muted-foreground">Ramp-up period</p>
          </div>
        </div>

        {/* Probe + run */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={probe}
            disabled={!selectedProjectId || probing || running}
            className="gap-2"
          >
            {probing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Probe
          </Button>
          <Button
            onClick={run}
            disabled={!selectedProjectId || running || probing}
            className="gap-2"
          >
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? `Running… ${elapsed}s / ${dur}s` : 'Run Load Test'}
          </Button>
        </div>

        {/* Progress bar */}
        {(running || (result && !error)) && (
          <div className="space-y-1">
            <div className="h-1.5 bg-foreground/8 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-foreground/70 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right">{pct}%</p>
          </div>
        )}

        {/* Probe result */}
        {probeResult && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-foreground/4 text-sm"
          >
            {probeResult.reachable
              ? <CheckCircle2 className="h-4 w-4 text-foreground/70 shrink-0" />
              : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
            <span className="truncate text-muted-foreground">{probeResult.url}</span>
            <span className="ml-auto shrink-0 font-mono">
              {probeResult.reachable
                ? `HTTP ${probeResult.statusCode} · ${probeResult.responseTimeMs}ms`
                : 'unreachable'}
            </span>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/6 text-sm text-red-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </motion.div>

      {/* Results */}
      {result?.summary && (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          {/* Verdict banner */}
          <motion.div variants={item}>
            <div className={`premium-panel p-4 flex items-center gap-3 ${result.summary.passed ? '' : 'border-red-500/25'}`}>
              {result.summary.passed
                ? <CheckCircle2 className="h-5 w-5 text-foreground/70" />
                : <XCircle className="h-5 w-5 text-red-400" />}
              <div>
                <p className="font-semibold">
                  {result.summary.passed ? 'All thresholds passed' : 'Some thresholds failed'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {result.config.virtualUsers} VUs × {result.config.durationSeconds}s against {result.targetUrl}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Latency chart */}
          <motion.div variants={item} className="premium-panel p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Latency Percentiles
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--foreground))" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} unit="ms" />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '12px' }}
                  formatter={(v: number) => [`${v}ms`, 'Latency']}
                />
                <ReferenceLine y={2000} strokeDasharray="4 4" stroke="hsl(var(--foreground)/0.2)" label={{ value: 'p95 threshold', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                <Area type="monotone" dataKey="value" stroke="hsl(var(--foreground))" strokeWidth={1.5} fill="url(#latGrad)" dot={{ r: 4, fill: 'hsl(var(--foreground))', strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Stat cards */}
          <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Requests', value: result.summary.totalRequests.toLocaleString() },
              { label: 'Req / sec', value: result.summary.requestRate.toFixed(1) },
              { label: 'Error Rate', value: `${result.summary.errorRate}%`, warn: result.summary.errorRate >= 5 },
              { label: 'Data Received', value: result.summary.dataReceived },
              { label: 'p50', value: `${result.summary.p50}ms` },
              { label: 'p95', value: `${result.summary.p95}ms`, warn: result.summary.p95 >= 2000 },
              { label: 'p99', value: `${result.summary.p99}ms`, warn: result.summary.p99 >= 5000 },
              { label: 'Max', value: `${result.summary.maxResponseTime}ms` },
            ].map(stat => (
              <div key={stat.label} className="premium-panel p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className={`text-2xl font-semibold mt-1 ${stat.warn ? 'text-red-400' : ''}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </motion.div>

          {/* Thresholds */}
          <motion.div variants={item} className="premium-panel p-6 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Thresholds</h3>
            {Object.entries(result.summary.thresholds).map(([name, th]) => (
              <div key={name} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <span className="text-sm">{name}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{th.value}</span>
                  {th.passed
                    ? <CheckCircle2 className="h-4 w-4 text-foreground/60" />
                    : <XCircle className="h-4 w-4 text-red-400" />}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
