'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Loader2, CheckCircle2, Github, Layers,
  Server, Database, Cpu, ArrowRight, Box, Activity,
  GitBranch, Zap, Plus, X, Lock, ChevronDown, ChevronUp,
  Info, FileText, AlertTriangle, Package, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

// ─── Types ────────────────────────────────────────────────────

type Step = 'url' | 'scanning' | 'configure' | 'deploying' | 'done';

interface ComposeService {
  name: string;
  kind: 'app' | 'database' | 'cache' | 'queue' | 'worker' | 'proxy';
  image?: string;
  buildContext?: string;
  dockerfile?: string;
  ports: number[];
  environment: Record<string, string>;
  dependsOn: string[];
  command?: string;
  isManagedByZyphron: boolean;
  managedType?: string;
  suggestedPort?: number;
  suggestedStartCommand?: string;
  networkAliases: string[];
}

interface ScanResult {
  hasCompose: boolean;
  composeFile?: string;
  services?: ComposeService[];
  appServices?: ComposeService[];
  managedServices?: ComposeService[];
  networks?: string[];
  hasEnvFile?: boolean;
  serviceCount?: number;
}

interface ServiceConfig {
  name: string;
  deploy: boolean;
  startCommand: string;
  port: number;
  envVars: Array<{ key: string; value: string }>;
  showEnv: boolean;
}

interface EnvEntry { key: string; value: string }

// ─── Helpers ─────────────────────────────────────────────────

function getToken() {
  return typeof window !== 'undefined' ? (localStorage.getItem('auth-token') ?? '') : '';
}

function parseEnvFile(text: string): EnvEntry[] {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .flatMap(l => {
      const eq = l.indexOf('=');
      if (eq === -1) return [];
      const key = l.slice(0, eq).trim();
      let value = l.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return key ? [{ key, value }] : [];
    });
}

function kindIcon(kind: string): React.ElementType {
  const map: Record<string, React.ElementType> = {
    database: Database, cache: Activity, worker: Cpu,
    proxy: ArrowRight, app: Server, queue: Activity,
  };
  return map[kind] ?? Server;
}

function kindLabel(svc: ComposeService): string {
  if (svc.isManagedByZyphron) return `Managed ${svc.managedType ?? svc.kind}`;
  return svc.kind.charAt(0).toUpperCase() + svc.kind.slice(1);
}

function kindColor(kind: string): string {
  const map: Record<string, string> = {
    database: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    cache:    'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    worker:   'text-purple-400 bg-purple-500/10 border-purple-500/20',
    proxy:    'text-cyan-400   bg-cyan-500/10   border-cyan-500/20',
    app:      'text-blue-400   bg-blue-500/10   border-blue-500/20',
    queue:    'text-pink-400   bg-pink-500/10   border-pink-500/20',
  };
  return map[kind] ?? 'text-muted-foreground bg-accent/40 border-border/60';
}

// ─── Component ────────────────────────────────────────────────

export default function DeployStackPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('url');

  // URL step
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [stackName, setStackName] = useState('');

  // Scan result
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState('');

  // Service configs (one per app service)
  const [serviceConfigs, setServiceConfigs] = useState<ServiceConfig[]>([]);

  // Global shared env vars
  const [sharedEnv, setSharedEnv] = useState<EnvEntry[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Deploy result
  const [deployedGroup, setDeployedGroup] = useState<{
    id: string;
    name: string;
    projects: Array<{ serviceName: string; id: string; url: string; slug: string }>;
  } | null>(null);
  const [deployError, setDeployError] = useState('');

  // ── Auto-derive stack name from URL ──────────────────────────
  useEffect(() => {
    if (!repoUrl || stackName) return;
    const parts = repoUrl.replace(/\.git$/, '').split('/');
    const name = parts[parts.length - 1] || '';
    if (name) setStackName(name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  }, [repoUrl, stackName]);

  // ── SCAN ──────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    if (!repoUrl) return;
    setStep('scanning');
    setScanError('');
    try {
      const res = await fetch(`${API}/api/v1/projects/scan-compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ repositoryUrl: repoUrl, branch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);

      const result: ScanResult = json.data;
      setScanResult(result);

      if (!result.hasCompose) {
        setScanError('No docker-compose.yml found in this repository. Use the regular deploy flow for single-service repos.');
        setStep('url');
        return;
      }

      // Build default service configs
      const configs: ServiceConfig[] = (result.appServices ?? []).map(svc => ({
        name: svc.name,
        deploy: true,
        startCommand: svc.suggestedStartCommand ?? svc.command ?? '',
        port: svc.suggestedPort ?? 3000,
        envVars: Object.entries(svc.environment).map(([key, value]) => ({ key, value })),
        showEnv: false,
      }));
      setServiceConfigs(configs);
      setStep('configure');
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
      setStep('url');
    }
  }, [repoUrl, branch]);

  // ── DEPLOY ────────────────────────────────────────────────────
  const handleDeploy = useCallback(async () => {
    setStep('deploying');
    setDeployError('');
    try {
      const services = serviceConfigs.map(c => ({
        name: c.name,
        deploy: c.deploy,
        startCommand: c.startCommand || undefined,
        port: c.port,
        envVariables: c.envVars.filter(v => v.key.trim()).map(v => ({
          key: v.key, value: v.value, environment: 'PRODUCTION' as const,
        })),
      }));

      const res = await fetch(`${API}/api/v1/projects/deploy-compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          name: stackName,
          repositoryUrl: repoUrl,
          branch,
          composeFile: scanResult?.composeFile ?? 'docker-compose.yml',
          services,
          sharedEnvVariables: sharedEnv.filter(v => v.key.trim()).map(v => ({
            key: v.key, value: v.value, environment: 'PRODUCTION' as const,
          })),
          manifest: { services: scanResult?.services },
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);

      setDeployedGroup({
        id: json.data.composeGroup.id,
        name: json.data.composeGroup.name,
        projects: json.data.projects,
      });
      setStep('done');
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : 'Deploy failed');
      setStep('configure');
    }
  }, [serviceConfigs, sharedEnv, stackName, repoUrl, branch, scanResult]);

  // ── Update service config ─────────────────────────────────────
  function updateConfig(name: string, patch: Partial<ServiceConfig>) {
    setServiceConfigs(prev => prev.map(c => c.name === name ? { ...c, ...patch } : c));
  }

  function addEnvRow(svcName: string) {
    setServiceConfigs(prev => prev.map(c =>
      c.name === svcName ? { ...c, envVars: [...c.envVars, { key: '', value: '' }] } : c
    ));
  }

  function removeEnvRow(svcName: string, idx: number) {
    setServiceConfigs(prev => prev.map(c =>
      c.name === svcName ? { ...c, envVars: c.envVars.filter((_, i) => i !== idx) } : c
    ));
  }

  function updateEnvRow(svcName: string, idx: number, field: 'key' | 'value', val: string) {
    setServiceConfigs(prev => prev.map(c =>
      c.name === svcName ? {
        ...c,
        envVars: c.envVars.map((e, i) => i === idx ? { ...e, [field]: field === 'key' ? val.toUpperCase() : val } : e),
      } : c
    ));
  }

  // ── Paste shared .env ─────────────────────────────────────────
  function applyPaste() {
    const parsed = parseEnvFile(pasteText);
    const existing = new Set(sharedEnv.map(e => e.key));
    const newEntries = parsed.filter(e => !existing.has(e.key));
    setSharedEnv(prev => [
      ...prev.filter(e => e.key), // keep non-empty existing
      ...newEntries,
    ]);
    setPasteText('');
    setShowPaste(false);
  }

  const deployableCount = serviceConfigs.filter(c => c.deploy).length;
  const allServices = scanResult?.services ?? [];
  const managedServices = scanResult?.managedServices ?? [];

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
          <Link href="/projects">
            <Button variant="ghost" size="icon" className="rounded-xl"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
            <Layers className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Deploy Docker Compose Stack</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Zyphron detects all services and deploys them connected</p>
          </div>
        </motion.div>

        {/* Progress steps */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
          className="flex items-center gap-2 text-sm"
        >
          {(['url', 'configure', 'done'] as const).map((s, i) => {
            const stepIndex = ['url', 'scanning', 'configure', 'deploying', 'done'].indexOf(step);
            const thisIndex = ['url', 'configure', 'done'].indexOf(s);
            const done = stepIndex > ['url', 'scanning', 'configure', 'deploying', 'done'].indexOf(
              s === 'configure' ? 'configure' : s === 'done' ? 'done' : 'url'
            );
            const active = (s === 'url' && (step === 'url' || step === 'scanning'))
              || (s === 'configure' && (step === 'configure' || step === 'deploying'))
              || (s === 'done' && step === 'done');
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-8 ${done || active ? 'bg-primary' : 'bg-border'}`} />}
                <span className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active ? 'bg-primary text-primary-foreground' :
                  done ? 'bg-primary/20 text-primary' :
                  'text-muted-foreground'
                }`}>
                  {s === 'url' ? '1. Repo URL' : s === 'configure' ? '2. Configure services' : '3. Deploy'}
                </span>
              </div>
            );
          })}
        </motion.div>

        {/* ── STEP: URL ─────────────────────────────────────── */}
        {(step === 'url' || step === 'scanning') && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="rounded-2xl border bg-card/60 backdrop-blur-sm p-6 space-y-5">
              <div className="space-y-2">
                <Label>GitHub / GitLab / Bitbucket URL</Label>
                <div className="relative">
                  <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="https://github.com/your-org/your-repo"
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    className="pl-10 font-mono text-sm"
                    disabled={step === 'scanning'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stack name</Label>
                  <Input
                    placeholder="My App Stack"
                    value={stackName}
                    onChange={e => setStackName(e.target.value)}
                    disabled={step === 'scanning'}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <div className="relative">
                    <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="main"
                      value={branch}
                      onChange={e => setBranch(e.target.value)}
                      className="pl-10"
                      disabled={step === 'scanning'}
                    />
                  </div>
                </div>
              </div>

              {scanError && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  {scanError}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleScan}
                  disabled={!repoUrl || !stackName || step === 'scanning'}
                  className="gap-2 flex-1"
                >
                  {step === 'scanning' ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Scanning docker-compose.yml…</>
                  ) : (
                    <><Package className="h-4 w-4" />Detect services</>
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Zyphron will shallow-clone the repo, parse <code className="font-mono text-xs bg-accent/60 px-1 py-0.5 rounded">docker-compose.yml</code>, and show you all detected services.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── STEP: CONFIGURE ───────────────────────────────── */}
        {(step === 'configure' || step === 'deploying') && scanResult && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* Detected services overview */}
            <div className="rounded-2xl border bg-card/60 backdrop-blur-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <h2 className="font-semibold">
                  Detected <span className="text-primary">{allServices.length} services</span> in <code className="font-mono text-sm">{scanResult.composeFile}</code>
                </h2>
              </div>

              {/* Service topology diagram */}
              <div className="flex items-start gap-3 flex-wrap p-4 rounded-xl bg-accent/20 border border-border/40">
                {allServices.map((svc, i) => {
                  const Icon = kindIcon(svc.kind);
                  const isManaged = svc.isManagedByZyphron;
                  return (
                    <div key={svc.name} className="flex items-center gap-2">
                      {i > 0 && (
                        <div className="flex items-center gap-1 text-muted-foreground/40">
                          {svc.dependsOn.length > 0 ? (
                            <ArrowRight className="h-3.5 w-3.5" />
                          ) : (
                            <span className="text-border">·</span>
                          )}
                        </div>
                      )}
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${kindColor(svc.kind)} ${isManaged ? 'opacity-60' : ''}`}>
                        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold leading-none">{svc.name}</p>
                          <p className="text-xs opacity-70 leading-none mt-0.5">{kindLabel(svc)}</p>
                        </div>
                        {isManaged && (
                          <span className="text-xs ml-1 opacity-70">→ managed</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Managed services note */}
              {managedServices.length > 0 && (
                <div className="mt-3 flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-blue-400 text-xs">
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>{managedServices.map(s => s.name).join(', ')}</strong> will be provisioned as managed Zyphron {managedServices.length > 1 ? 'databases/caches' : managedServices[0].kind}.
                    The connection URLs will be injected automatically as env vars.
                  </span>
                </div>
              )}
            </div>

            {/* Shared .env panel */}
            <div className="rounded-2xl border bg-card/60 backdrop-blur-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    Shared environment variables
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Applied to ALL app services. Perfect for API keys, secrets, DB URLs.</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowPaste(v => !v)}>
                  <FileText className="h-3.5 w-3.5" />
                  Paste .env
                </Button>
              </div>

              <AnimatePresence>
                {showPaste && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <textarea
                      className="w-full h-36 font-mono text-xs p-3 rounded-xl border bg-background/60 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="DATABASE_URL=postgresql://...\nREDIS_URL=redis://...\nOPENAI_API_KEY=sk-..."
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                    />
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={applyPaste} disabled={!pasteText} className="text-xs gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />Apply
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowPaste(false)} className="text-xs">Cancel</Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                {sharedEnv.map((entry, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input
                      value={entry.key}
                      placeholder="KEY"
                      className="flex-1 font-mono text-xs uppercase"
                      onChange={e => setSharedEnv(prev => prev.map((v, i) => i === idx ? { ...v, key: e.target.value.toUpperCase() } : v))}
                    />
                    <Input
                      value={entry.value}
                      placeholder="value"
                      type={/SECRET|KEY|PASSWORD|TOKEN/.test(entry.key) ? 'password' : 'text'}
                      className="flex-[2] font-mono text-xs"
                      onChange={e => setSharedEnv(prev => prev.map((v, i) => i === idx ? { ...v, value: e.target.value } : v))}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400"
                      onClick={() => setSharedEnv(prev => prev.filter((_, i) => i !== idx))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground"
                  onClick={() => setSharedEnv(prev => [...prev, { key: '', value: '' }])}>
                  <Plus className="h-3.5 w-3.5" />Add variable
                </Button>
              </div>
            </div>

            {/* Per-service configuration */}
            {serviceConfigs.map((config, ci) => {
              const svc = allServices.find(s => s.name === config.name);
              if (!svc) return null;
              const Icon = kindIcon(svc.kind);
              return (
                <motion.div
                  key={config.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: ci * 0.05 }}
                  className={`rounded-2xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-opacity ${!config.deploy ? 'opacity-50' : ''}`}
                >
                  {/* Service header */}
                  <div className="p-5 flex items-start gap-4">
                    <div className={`p-3 rounded-xl border ${kindColor(svc.kind)} flex-shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold">{config.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${kindColor(svc.kind)}`}>
                          {kindLabel(svc)}
                        </span>
                        {svc.image && (
                          <span className="text-xs text-muted-foreground font-mono">{svc.image}</span>
                        )}
                      </div>
                      {svc.dependsOn.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Depends on: <span className="font-mono">{svc.dependsOn.join(', ')}</span>
                        </p>
                      )}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none flex-shrink-0">
                      <span className="text-xs text-muted-foreground">Deploy</span>
                      <div
                        onClick={() => updateConfig(config.name, { deploy: !config.deploy })}
                        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${config.deploy ? 'bg-primary' : 'bg-border'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.deploy ? 'translate-x-4' : ''}`} />
                      </div>
                    </label>
                  </div>

                  {/* Config inputs */}
                  {config.deploy && (
                    <div className="px-5 pb-5 space-y-4 border-t border-border/40 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Start command</Label>
                          <Input
                            value={config.startCommand}
                            placeholder={svc.kind === 'worker' ? 'celery -A app.celery worker' : 'npm start'}
                            className="font-mono text-xs"
                            onChange={e => updateConfig(config.name, { startCommand: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Port</Label>
                          <Input
                            type="number"
                            value={config.port}
                            className="font-mono text-xs"
                            onChange={e => updateConfig(config.name, { port: parseInt(e.target.value) || 3000 })}
                          />
                        </div>
                      </div>

                      {/* Per-service env vars */}
                      <div>
                        <button
                          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => updateConfig(config.name, { showEnv: !config.showEnv })}
                        >
                          {config.showEnv ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          Service-specific env vars
                          {config.envVars.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs">{config.envVars.length}</span>
                          )}
                        </button>

                        <AnimatePresence>
                          {config.showEnv && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-2 space-y-2">
                              {config.envVars.map((ev, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                  <Input value={ev.key} placeholder="KEY" className="flex-1 font-mono text-xs uppercase"
                                    onChange={e => updateEnvRow(config.name, idx, 'key', e.target.value)} />
                                  <Input value={ev.value} placeholder="value"
                                    type={/SECRET|KEY|PASSWORD|TOKEN/.test(ev.key) ? 'password' : 'text'}
                                    className="flex-[2] font-mono text-xs"
                                    onChange={e => updateEnvRow(config.name, idx, 'value', e.target.value)} />
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400"
                                    onClick={() => removeEnvRow(config.name, idx)}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ))}
                              <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground"
                                onClick={() => addEnvRow(config.name)}>
                                <Plus className="h-3.5 w-3.5" />Add
                              </Button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Deploy button */}
            {deployError && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {deployError}
              </div>
            )}

            <Button
              onClick={handleDeploy}
              disabled={deployableCount === 0 || step === 'deploying'}
              size="lg"
              className="w-full gap-3 h-14 text-base font-semibold"
            >
              {step === 'deploying' ? (
                <><Loader2 className="h-5 w-5 animate-spin" />Deploying {deployableCount} services…</>
              ) : (
                <><Zap className="h-5 w-5" />Deploy stack — {deployableCount} service{deployableCount !== 1 ? 's' : ''}</>
              )}
            </Button>
          </motion.div>
        )}

        {/* ── STEP: DONE ────────────────────────────────────── */}
        {step === 'done' && deployedGroup && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
            <div className="rounded-2xl border bg-card/60 backdrop-blur-sm p-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold mb-1">Stack deployed!</h2>
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">{deployedGroup.name}</span> — {deployedGroup.projects.length} services created and build queued
              </p>
            </div>

            {/* Service cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deployedGroup.projects.map((proj, i) => {
                const svc = allServices.find(s => s.name === proj.serviceName);
                const Icon = kindIcon(svc?.kind ?? 'app');
                return (
                  <motion.div
                    key={proj.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="rounded-xl border bg-card/60 p-4 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl border ${kindColor(svc?.kind ?? 'app')}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{proj.serviceName}</p>
                        <p className="text-xs text-muted-foreground">Build queued</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/projects/${proj.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
                          <Settings className="h-3.5 w-3.5" />View project
                        </Button>
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <Link href="/projects/stacks" className="flex-1">
                <Button className="w-full gap-2">
                  <Layers className="h-4 w-4" />View stack dashboard
                </Button>
              </Link>
              <Link href="/projects">
                <Button variant="outline" className="gap-2">
                  <ArrowRight className="h-4 w-4" />All projects
                </Button>
              </Link>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
