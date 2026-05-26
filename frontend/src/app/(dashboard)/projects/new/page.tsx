'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Github,
  GitBranch,
  Folder,
  Loader2,
  CheckCircle2,
  Search,
  RefreshCw,
  Lock,
  ExternalLink,
  Zap,
  KeyRound,
  ChevronDown,
  ChevronUp,
  FileText,
  Plus,
  X,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useGitHubAccount,
  useGitHubRepos,
  useAnalyzeRepo,
  useGitHubBranches,
  useInitiateGitHubOAuth,
  useGitHubOAuthCallback,
  type GitHubRepo,
  type RepoAnalysis
} from '@/hooks/use-github';
import { useCreateProject, useDeployProject } from '@/hooks/use-projects';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 'connect' | 'select' | 'configure' | 'deploying';

interface EnvVar {
  name: string;
  required: boolean;
  hasDefault: boolean;
  purpose?: string;
  example?: string;
}

interface EnvEntry { key: string; value: string }

// ─── Framework icons ─────────────────────────────────────────────────────────

const frameworkIcons: Record<string, string> = {
  nextjs: 'Next', react: 'React', vue: 'Vue', nuxt: 'Vue',
  svelte: 'Svelte', sveltekit: 'Svelte', angular: 'Angular',
  express: 'Node', fastify: 'Node', nestjs: 'Nest',
  flask: 'Python', django: 'Python', fastapi: 'Python',
  go: 'Go', rust: 'Rust', astro: 'Astro', remix: 'Remix',
  static: 'Static', docker: 'Docker', python: 'Python', unknown: 'Pkg',
};

// ─── Env paste parser ─────────────────────────────────────────────────────────

function parseEnvFile(text: string): EnvEntry[] {
  return text.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .flatMap(line => {
      const eq = line.indexOf('=');
      if (eq === -1) return [];
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return key ? [{ key, value }] : [];
    });
}

// ─── ENV panel component ─────────────────────────────────────────────────────

function EnvPanel({
  repoUrl,
  envEntries,
  setEnvEntries,
}: {
  repoUrl: string;
  envEntries: EnvEntry[];
  setEnvEntries: (e: EnvEntry[]) => void;
}) {
  const [scanned, setScanned] = useState<EnvVar[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [expanded, setExpanded] = useState(true);

  // Auto-scan when component mounts
  useEffect(() => {
    if (!repoUrl || scanDone) return;
    let cancelled = false;
    const scan = async () => {
      setScanning(true);
      try {
        const token = localStorage.getItem('auth-token');
        const res = await fetch(`${API}/api/v1/projects/scan-env`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ repositoryUrl: repoUrl }),
        });
        if (!cancelled && res.ok) {
          const json = await res.json() as { data?: { vars?: EnvVar[] } };
          const vars = json.data?.vars ?? [];
          setScanned(vars);
          // Pre-fill entries for vars not already in envEntries
          if (vars.length > 0) {
            const existing = new Set(envEntries.map(e => e.key));
            const newEntries = vars
              .filter(v => !existing.has(v.name))
              .map(v => ({ key: v.name, value: v.example && !v.required ? v.example : '' }));
            if (newEntries.length > 0) {
              setEnvEntries([...envEntries, ...newEntries]);
            }
          }
        }
      } catch { /* ignore scan errors */ }
      finally {
        if (!cancelled) { setScanning(false); setScanDone(true); }
      }
    };
    void scan();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl]);

  const applyPaste = () => {
    const parsed = parseEnvFile(pasteText);
    if (!parsed.length) return;
    // Merge: paste overwrites existing keys, adds new ones
    const merged = new Map(envEntries.map(e => [e.key, e.value]));
    parsed.forEach(({ key, value }) => merged.set(key, value));
    setEnvEntries(Array.from(merged.entries()).map(([key, value]) => ({ key, value })));
    setPasteText('');
    setShowPaste(false);
  };

  const updateEntry = (idx: number, field: 'key' | 'value', val: string) => {
    setEnvEntries(envEntries.map((e, i) => i === idx ? { ...e, [field]: val } : e));
  };

  const removeEntry = (idx: number) => {
    setEnvEntries(envEntries.filter((_, i) => i !== idx));
  };

  const addBlank = () => {
    setEnvEntries([...envEntries, { key: '', value: '' }]);
  };

  const purposeFor = (key: string) => scanned.find(v => v.name === key)?.purpose;
  const requiredFor = (key: string) => scanned.find(v => v.name === key)?.required ?? false;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <div className="text-left">
            <p className="font-semibold">Environment Variables</p>
            <p className="text-sm text-muted-foreground">
              {scanning
                ? 'Scanning repo for required variables…'
                : scanDone && scanned.length > 0
                ? `${scanned.length} variable${scanned.length !== 1 ? 's' : ''} detected from source code`
                : envEntries.length > 0
                ? `${envEntries.filter(e => e.key && e.value).length} of ${envEntries.length} variable${envEntries.length !== 1 ? 's' : ''} filled`
                : 'Optional — add at any time from project settings'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scanning && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {envEntries.filter(e => e.key && e.value).length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {envEntries.filter(e => e.key && e.value).length} set
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4 border-t border-border/40">
          {/* Paste .env button */}
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              {scanned.length > 0
                ? 'Detected from your source code — fill in the values below'
                : 'No env file detected — add variables manually or paste your .env file'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 flex-shrink-0"
              onClick={() => setShowPaste(p => !p)}
            >
              <FileText className="h-4 w-4" />
              Paste .env file
            </Button>
          </div>

          {/* Paste textarea */}
          {showPaste && (
            <div className="space-y-2 p-4 rounded-lg border border-border/60 bg-muted/20">
              <p className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Paste your <code className="font-mono text-xs bg-muted px-1 rounded">.env</code> file contents
              </p>
              <p className="text-xs text-muted-foreground">
                Copy the entire contents of your <code className="font-mono bg-muted px-1 rounded">.env</code> file and paste it here. Comments are ignored.
              </p>
              <textarea
                className="w-full h-48 font-mono text-xs rounded-md border border-input bg-background px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={'DATABASE_URL=postgresql://user:pass@localhost:5432/mydb\nJWT_SECRET=your-secret-key\nNEXT_PUBLIC_API_URL=https://api.example.com\n# Comments are ignored'}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={applyPaste} disabled={!pasteText.trim()}>
                  Apply {pasteText.trim() ? `(${parseEnvFile(pasteText).length} vars)` : ''}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setShowPaste(false); setPasteText(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Variable rows */}
          {envEntries.length > 0 && (
            <div className="space-y-2">
              {envEntries.map((entry, idx) => {
                const purpose = purposeFor(entry.key);
                const required = requiredFor(entry.key);
                return (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
                    <div className="space-y-1">
                      <Input
                        className="font-mono text-sm h-9"
                        placeholder="VARIABLE_NAME"
                        value={entry.key}
                        onChange={e => updateEntry(idx, 'key', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                        spellCheck={false}
                      />
                      {required && (
                        <p className="text-xs text-amber-500 flex items-center gap-1 px-1">
                          <Info className="h-3 w-3" /> Required
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Input
                        className="font-mono text-sm h-9"
                        placeholder={purpose || 'value'}
                        value={entry.value}
                        type={entry.key.match(/SECRET|PASSWORD|TOKEN|KEY|PASS/i) ? 'password' : 'text'}
                        onChange={e => updateEntry(idx, 'value', e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                      />
                      {purpose && (
                        <p className="text-xs text-muted-foreground px-1 truncate">{purpose}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-red-400 flex-shrink-0"
                      onClick={() => removeEntry(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add row */}
          <Button type="button" variant="outline" size="sm" className="gap-2 w-full" onClick={addBlank}>
            <Plus className="h-4 w-4" />
            Add Variable
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('connect');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [search, setSearch] = useState('');
  const [repoPage, setRepoPage] = useState(1);
  const [projectConfig, setProjectConfig] = useState({
    name: '',
    slug: '',
    branch: 'main',
    rootDirectory: './',
    buildCommand: '',
    installCommand: '',
    startCommand: '',
    outputDirectory: '',
  });
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [gitUrl, setGitUrl] = useState('');
  const [connectError, setConnectError] = useState('');
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([]);

  // GitHub queries
  const { data: githubAccount, isLoading: accountLoading, refetch: refetchAccount } = useGitHubAccount();
  const githubConnected = Boolean(githubAccount?.data?.connected);
  const { data: reposData, isLoading: reposLoading, refetch: refetchRepos } = useGitHubRepos(repoPage, githubConnected);
  const initiateOAuth = useInitiateGitHubOAuth();
  const oauthCallback = useGitHubOAuthCallback();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (code && state) {
      oauthCallback.mutate({ code, state }, {
        onSuccess: () => { router.replace('/projects/new'); refetchAccount(); },
        onError: (error) => { console.error('OAuth callback error:', error); },
      });
    }
  }, [searchParams, oauthCallback, router, refetchAccount]);

  useEffect(() => {
    if (!accountLoading) {
      setStep(githubAccount?.data?.connected ? 'select' : 'connect');
    }
  }, [githubAccount, accountLoading]);

  const repoOwner = selectedRepo?.fullName?.split('/')[0] || '';
  const repoName = selectedRepo?.fullName?.split('/')[1] || '';
  const { data: analysisData, isLoading: analysisLoading } = useAnalyzeRepo(repoOwner, repoName, projectConfig.branch, githubConnected);
  const { data: branchesData } = useGitHubBranches(repoOwner, repoName, githubConnected);

  useEffect(() => {
    if (analysisData?.data) {
      setAnalysis(analysisData.data);
      const s = analysisData.data.suggestedConfig;
      setProjectConfig(prev => ({
        ...prev,
        name: s.name || prev.name,
        slug: s.slug || prev.slug,
        branch: s.branch || prev.branch,
        buildCommand: s.buildCommand || '',
        installCommand: s.installCommand || '',
        startCommand: s.startCommand || '',
        outputDirectory: s.outputDirectory || '',
      }));
    }
  }, [analysisData]);

  const createProject = useCreateProject();
  const deployProject = useDeployProject();

  const repos = reposData?.data || [];
  const branches = branchesData?.data || [];
  const filteredRepos = repos.filter(repo =>
    repo.name.toLowerCase().includes(search.toLowerCase()) ||
    repo.fullName.toLowerCase().includes(search.toLowerCase()) ||
    (repo.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const handleConnectGitHub = () => {
    setConnectError('');
    initiateOAuth.mutate(undefined, {
      onError: (error) => {
        setConnectError(error instanceof Error ? error.message : 'GitHub OAuth is not available in this environment.');
      },
    });
  };

  const handleSelectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setEnvEntries([]); // reset env for new repo
    setProjectConfig(prev => ({
      ...prev,
      name: repo.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      slug: repo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      branch: repo.defaultBranch,
      rootDirectory: './',
    }));
    setStep('configure');
  };

  const handleImportUrl = () => {
    if (!gitUrl) return;
    const match = gitUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match) {
      const [, owner, name] = match;
      const repoName = name.replace(/\.git$/, '');
      setSelectedRepo({
        id: 'url-import',
        name: repoName,
        fullName: `${owner}/${repoName}`,
        private: false,
        url: gitUrl,
        cloneUrl: gitUrl.endsWith('.git') ? gitUrl : `${gitUrl}.git`,
        sshUrl: `git@github.com:${owner}/${repoName}.git`,
        defaultBranch: 'main',
        updatedAt: new Date().toISOString(),
        pushedAt: new Date().toISOString(),
        language: null,
        description: null,
        stars: 0,
        forks: 0,
      });
      setProjectConfig(prev => ({
        ...prev,
        name: repoName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        slug: repoName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        branch: 'main',
        rootDirectory: './',
      }));
      setEnvEntries([]);
      setStep('configure');
    }
  };

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleCreate = async () => {
    if (!selectedRepo) return;
    setStep('deploying');
    try {
      const cleanedEnv = envEntries.filter(e => e.key.trim() && e.value.trim());

      const project = await createProject.mutateAsync({
        name: projectConfig.name,
        slug: projectConfig.slug,
        repositoryUrl: selectedRepo.cloneUrl || selectedRepo.url,
        branch: projectConfig.branch,
        rootDirectory: projectConfig.rootDirectory || './',
        buildCommand: projectConfig.buildCommand || undefined,
        installCommand: projectConfig.installCommand || undefined,
        startCommand: projectConfig.startCommand || undefined,
        outputDirectory: projectConfig.outputDirectory || undefined,
        autoDeploy: true,
        // Pass env vars to be stored immediately
        ...(cleanedEnv.length > 0 ? {
          envVariables: cleanedEnv.map(e => ({
            key: e.key,
            value: e.value,
            environment: 'PRODUCTION' as const,
          })),
        } : {}),
      } as Parameters<typeof createProject.mutateAsync>[0]);

      const createdProject = project?.data && typeof project.data === 'object' && 'project' in project.data
        ? (project.data.project as { slug?: string })
        : (project.data as { slug?: string });
      const createdSlug = createdProject?.slug;

      if (!createdSlug) throw new Error('Project was created but slug was not returned by API.');

      await deployProject.mutateAsync({ slug: createdSlug, branch: projectConfig.branch });
      router.push(`/projects/${createdSlug}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('status 409')) {
        const suffix = String(Date.now()).slice(-4);
        setProjectConfig(prev => ({ ...prev, slug: `${generateSlug(prev.name || selectedRepo!.name)}-${suffix}` }));
      }
      setStep('configure');
    }
  };

  const formatDate = (date: string) => {
    const diffDays = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  if (accountLoading || oauthCallback.isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {oauthCallback.isPending ? 'Connecting GitHub account...' : 'Loading...'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Create New Project</h1>
          <p className="text-muted-foreground">Import a Git repository to deploy</p>
        </div>
      </div>

      {/* Steps Indicator */}
      <div className="flex items-center gap-4 py-4">
        <StepIndicator number={1} label="Connect" active={step === 'connect'} completed={step !== 'connect'} />
        <div className="flex-1 h-px bg-border" />
        <StepIndicator number={2} label="Select Repository" active={step === 'select'} completed={step === 'configure' || step === 'deploying'} />
        <div className="flex-1 h-px bg-border" />
        <StepIndicator number={3} label="Configure" active={step === 'configure'} completed={step === 'deploying'} />
        <div className="flex-1 h-px bg-border" />
        <StepIndicator number={4} label="Deploy" active={step === 'deploying'} completed={false} />
      </div>

      {/* ── Step: Connect GitHub ── */}
      {step === 'connect' && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-8 text-center">
            <Github className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Connect Your GitHub Account</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Connect your GitHub account to import repositories and enable automatic deployments on push.
            </p>
            <Button size="lg" onClick={handleConnectGitHub} disabled={initiateOAuth.isPending} className="gap-2">
              {initiateOAuth.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Github className="h-5 w-5" />}
              Connect GitHub
            </Button>
            {connectError && <p className="text-sm text-red-500 mt-4">{connectError}</p>}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold mb-2">Import from URL</h3>
            <p className="text-sm text-muted-foreground mb-4">Enter the URL of a public Git repository</p>
            <div className="flex gap-2">
              <Input placeholder="https://github.com/user/repo" className="flex-1" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} />
              <Button onClick={handleImportUrl} disabled={!gitUrl}>Import</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step: Select Repository ── */}
      {step === 'select' && (
        <div className="space-y-4">
          {githubAccount?.data && (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {githubAccount.data.avatarUrl && (
                    <img src={githubAccount.data.avatarUrl ?? ''} alt="GitHub avatar" className="h-10 w-10 rounded-full" />
                  )}
                  <div>
                    <p className="font-medium">{githubAccount.data.name || githubAccount.data.username}</p>
                    <p className="text-sm text-muted-foreground">@{githubAccount.data.username}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchRepos()} className="gap-2">
                  <RefreshCw className="h-4 w-4" />Refresh
                </Button>
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search repositories..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>

          <div className="rounded-lg border divide-y max-h-[500px] overflow-y-auto">
            {reposLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-muted-foreground">Loading repositories...</p>
              </div>
            ) : filteredRepos.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {search ? 'No repositories found matching your search' : 'No repositories found'}
              </div>
            ) : (
              filteredRepos.map((repo) => (
                <div key={repo.id} className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => handleSelectRepo(repo)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Github className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{repo.name}</p>
                        {repo.private && <Lock className="h-3 w-3 text-yellow-600" />}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {repo.language && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />{repo.language}</span>}
                        <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" />{repo.defaultBranch}</span>
                        <span>{formatDate(repo.pushedAt)}</span>
                      </div>
                      {repo.description && <p className="text-sm text-muted-foreground truncate mt-1">{repo.description}</p>}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="flex-shrink-0">Import</Button>
                </div>
              ))
            )}
          </div>

          {reposData?.pagination && (
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setRepoPage(p => Math.max(1, p - 1))} disabled={!reposData.pagination.hasPrevPage}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {reposData.pagination.page}</span>
              <Button variant="outline" size="sm" onClick={() => setRepoPage(p => p + 1)} disabled={!reposData.pagination.hasNextPage}>Next</Button>
            </div>
          )}

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-4">
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <Input placeholder="https://github.com/user/repo" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} />
              </div>
              <Button onClick={handleImportUrl} disabled={!gitUrl} variant="outline">Import URL</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step: Configure ── */}
      {step === 'configure' && selectedRepo && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <Github className="h-6 w-6 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{selectedRepo.fullName}</p>
                {selectedRepo.description && <p className="text-sm text-muted-foreground truncate">{selectedRepo.description}</p>}
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep('select')}>Change</Button>
            </div>
          </div>

          {analysisLoading ? (
            <div className="rounded-lg border bg-card p-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Analyzing repository...</p>
            </div>
          ) : analysis && (
            <div className="rounded-lg border bg-gradient-to-r from-primary/5 to-primary/10 p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-background flex items-center justify-center text-2xl">
                  {frameworkIcons[analysis.detection.framework] || frameworkIcons.unknown}
                </div>
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Auto-detected: {analysis.detection.framework.charAt(0).toUpperCase() + analysis.detection.framework.slice(1)}
                  </p>
                  <p className="text-sm text-muted-foreground">{analysis.detection.language} · Port {analysis.detection.port}</p>
                </div>
              </div>
            </div>
          )}

          {/* Project Settings */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h3 className="font-semibold">Project Settings</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name</Label>
                <Input id="name" value={projectConfig.name} onChange={(e) => setProjectConfig({ ...projectConfig, name: e.target.value, slug: generateSlug(e.target.value) })} placeholder="My Awesome Project" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Project Slug</Label>
                <Input id="slug" value={projectConfig.slug} onChange={(e) => setProjectConfig({ ...projectConfig, slug: generateSlug(e.target.value) })} placeholder="my-awesome-project" />
                <p className="text-xs text-muted-foreground">{projectConfig.slug}.zyphron.space</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <select id="branch" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={projectConfig.branch} onChange={(e) => setProjectConfig({ ...projectConfig, branch: e.target.value })}>
                  {branches.length > 0 ? branches.map(b => <option key={b.name} value={b.name}>{b.name}{b.protected ? ' (protected)' : ''}</option>) : <option value={selectedRepo.defaultBranch}>{selectedRepo.defaultBranch}</option>}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="root">Root Directory</Label>
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <Input id="root" value={projectConfig.rootDirectory} onChange={(e) => setProjectConfig({ ...projectConfig, rootDirectory: e.target.value })} placeholder="./" />
                </div>
              </div>
            </div>
          </div>

          {/* Build Settings */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Build & Output Settings</h3>
              <span className="text-xs text-muted-foreground">Optional — auto-detected if empty</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="install">Install Command</Label>
                <Input id="install" value={projectConfig.installCommand} onChange={(e) => setProjectConfig({ ...projectConfig, installCommand: e.target.value })} placeholder={analysis?.detection.installCommand || 'npm install'} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="build">Build Command</Label>
                <Input id="build" value={projectConfig.buildCommand} onChange={(e) => setProjectConfig({ ...projectConfig, buildCommand: e.target.value })} placeholder={analysis?.detection.buildCommand || 'npm run build'} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start">Start Command</Label>
                <Input id="start" value={projectConfig.startCommand} onChange={(e) => setProjectConfig({ ...projectConfig, startCommand: e.target.value })} placeholder={analysis?.detection.startCommand || 'npm start'} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="output">Output Directory</Label>
                <Input id="output" value={projectConfig.outputDirectory} onChange={(e) => setProjectConfig({ ...projectConfig, outputDirectory: e.target.value })} placeholder={analysis?.detection.outputDirectory || '.next'} />
              </div>
            </div>
          </div>

          {/* ── ENV Detection Panel ── */}
          <EnvPanel
            repoUrl={selectedRepo.cloneUrl || selectedRepo.url}
            envEntries={envEntries}
            setEnvEntries={setEnvEntries}
          />

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => setStep('select')}>Back</Button>
            <Button
              onClick={handleCreate}
              disabled={createProject.isPending || !projectConfig.name || !projectConfig.slug}
              size="lg"
              className="gap-2"
            >
              {createProject.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</>
                : <><Zap className="h-4 w-4" />Deploy{envEntries.filter(e => e.key && e.value).length > 0 ? ` with ${envEntries.filter(e => e.key && e.value).length} env vars` : ''}</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Deploying ── */}
      {step === 'deploying' && (
        <div className="rounded-lg border bg-card p-12 text-center">
          <div className="relative inline-flex">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-white" />
            </div>
          </div>
          <h2 className="text-xl font-semibold mt-6 mb-2">Creating Your Project</h2>
          <p className="text-muted-foreground mb-4">Setting up deployment pipeline and triggering first build...</p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Cloning repository
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ number, label, active, completed }: { number: number; label: string; active: boolean; completed: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${active ? 'text-primary' : 'text-muted-foreground'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${completed ? 'bg-green-500 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
        {completed ? <CheckCircle2 className="h-4 w-4" /> : number}
      </div>
      <span className="font-medium hidden sm:inline">{label}</span>
    </div>
  );
}
