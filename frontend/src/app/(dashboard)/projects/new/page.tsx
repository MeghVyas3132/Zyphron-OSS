'use client';

import { useState, useEffect } from 'react';
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
  Zap
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

type Step = 'connect' | 'select' | 'configure' | 'deploying';

const frameworkIcons: Record<string, string> = {
  nextjs: '▲',
  react: '⚛️',
  vue: '💚',
  nuxt: '💚',
  svelte: '🔥',
  sveltekit: '🔥',
  angular: '🔺',
  express: '⚡',
  fastify: '⚡',
  nestjs: '🐱',
  flask: '🐍',
  django: '🐍',
  fastapi: '🐍',
  go: '🐹',
  rust: '🦀',
  astro: '🚀',
  remix: '💿',
  static: '📄',
  docker: '🐳',
  python: '🐍',
  unknown: '📦',
};

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

  // GitHub queries
  const { data: githubAccount, isLoading: accountLoading, refetch: refetchAccount } = useGitHubAccount();
  const { data: reposData, isLoading: reposLoading, refetch: refetchRepos } = useGitHubRepos(repoPage);
  const initiateOAuth = useInitiateGitHubOAuth();
  const oauthCallback = useGitHubOAuthCallback();

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    
    if (code && state) {
      oauthCallback.mutate({ code, state }, {
        onSuccess: () => {
          router.replace('/projects/new');
          refetchAccount();
        },
        onError: (error) => {
          console.error('OAuth callback error:', error);
        },
      });
    }
  }, [searchParams, oauthCallback, router, refetchAccount]);

  // Determine initial step based on GitHub connection
  useEffect(() => {
    if (!accountLoading) {
      if (githubAccount?.data?.connected) {
        setStep('select');
      } else {
        setStep('connect');
      }
    }
  }, [githubAccount, accountLoading]);

  // Repository analysis
  const repoOwner = selectedRepo?.fullName?.split('/')[0] || '';
  const repoName = selectedRepo?.fullName?.split('/')[1] || '';
  const { data: analysisData, isLoading: analysisLoading } = useAnalyzeRepo(
    repoOwner,
    repoName,
    projectConfig.branch
  );
  const { data: branchesData } = useGitHubBranches(repoOwner, repoName);

  // Update analysis when data changes
  useEffect(() => {
    if (analysisData?.data) {
      setAnalysis(analysisData.data);
      const suggested = analysisData.data.suggestedConfig;
      setProjectConfig((prev) => ({
        ...prev,
        name: suggested.name || prev.name,
        slug: suggested.slug || prev.slug,
        branch: suggested.branch || prev.branch,
        buildCommand: suggested.buildCommand || '',
        installCommand: suggested.installCommand || '',
        startCommand: suggested.startCommand || '',
        outputDirectory: suggested.outputDirectory || '',
      }));
    }
  }, [analysisData]);

  // Project creation
  const createProject = useCreateProject();
  const deployProject = useDeployProject();

  const repos = reposData?.data || [];
  const branches = branchesData?.data || [];

  const filteredRepos = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(search.toLowerCase()) ||
      repo.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (repo.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const handleConnectGitHub = () => {
    initiateOAuth.mutate();
  };

  const handleSelectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setProjectConfig((prev) => ({
      ...prev,
      name: repo.name.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      slug: repo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      branch: repo.defaultBranch,
      rootDirectory: './',
    }));
    setStep('configure');
  };

  const handleImportUrl = () => {
    if (!gitUrl) return;
    
    const match = gitUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
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
      
      setProjectConfig((prev) => ({
        ...prev,
        name: repoName.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        slug: repoName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        branch: 'main',
        rootDirectory: './',
      }));
      
      setStep('configure');
    }
  };

  const handleCreate = async () => {
    if (!selectedRepo) return;

    setStep('deploying');

    try {
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
      });

      await deployProject.mutateAsync({
        slug: project.data.slug,
        branch: projectConfig.branch,
      });

      router.push(`/projects/${project.data.slug}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      setStep('configure');
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
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
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
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

      {/* Step: Connect GitHub */}
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

      {/* Step: Select Repository */}
      {step === 'select' && (
        <div className="space-y-4">
          {githubAccount?.data && (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {githubAccount.data.avatarUrl && (
                    <img src={githubAccount.data.avatarUrl} alt={githubAccount.data.username} className="h-10 w-10 rounded-full" />
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
              <Button variant="outline" size="sm" onClick={() => setRepoPage((p) => Math.max(1, p - 1))} disabled={!reposData.pagination.hasPrevPage}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {reposData.pagination.page}</span>
              <Button variant="outline" size="sm" onClick={() => setRepoPage((p) => p + 1)} disabled={!reposData.pagination.hasNextPage}>Next</Button>
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

      {/* Step: Configure */}
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
                  <p className="text-sm text-muted-foreground">{analysis.detection.language} • Port {analysis.detection.port}</p>
                </div>
              </div>
            </div>
          )}

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
                <p className="text-xs text-muted-foreground">{projectConfig.slug}.zyphron.app</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <select id="branch" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={projectConfig.branch} onChange={(e) => setProjectConfig({ ...projectConfig, branch: e.target.value })}>
                  {branches.length > 0 ? branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name} {branch.protected && '(protected)'}</option>) : <option value={selectedRepo.defaultBranch}>{selectedRepo.defaultBranch}</option>}
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

          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Build & Output Settings</h3>
              <span className="text-xs text-muted-foreground">Optional - Auto-detected if empty</span>
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

          <div className="flex items-center justify-between pt-4">
            <Button variant="outline" onClick={() => setStep('select')}>Back</Button>
            <Button onClick={handleCreate} disabled={createProject.isPending || !projectConfig.name || !projectConfig.slug} size="lg" className="gap-2">
              {createProject.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : <><Zap className="h-4 w-4" />Deploy</>}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Deploying */}
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
