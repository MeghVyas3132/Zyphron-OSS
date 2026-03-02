'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft,
  Settings,
  Key,
  Globe,
  Webhook,
  AlertTriangle,
  Trash2,
  GitBranch,
  Loader2,
  RefreshCw,
  Save,
  Code,
  FolderRoot
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProject, useUpdateProject, useDeleteProject } from '@/hooks/use-projects';
import { EnvVariables } from '@/components/project/env-variables';
import { Domains } from '@/components/project/domains';
import { Webhooks } from '@/components/project/webhooks';

type SettingsTab = 'general' | 'environment' | 'domains' | 'webhooks' | 'danger';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'environment', label: 'Environment Variables', icon: Key },
  { id: 'domains', label: 'Domains', icon: Globe },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
];

const frameworkOptions = [
  { value: 'nextjs', label: 'Next.js' },
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue.js' },
  { value: 'nuxt', label: 'Nuxt' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'sveltekit', label: 'SvelteKit' },
  { value: 'angular', label: 'Angular' },
  { value: 'express', label: 'Express' },
  { value: 'fastify', label: 'Fastify' },
  { value: 'nestjs', label: 'NestJS' },
  { value: 'flask', label: 'Flask' },
  { value: 'django', label: 'Django' },
  { value: 'fastapi', label: 'FastAPI' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'static', label: 'Static Site' },
  { value: 'docker', label: 'Docker' },
];

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  
  const { data: projectData, isLoading, refetch } = useProject(slug);
  const updateMutation = useUpdateProject(slug);
  const deleteMutation = useDeleteProject();
  
  const project = projectData?.data;
  
  // General settings form state
  const [name, setName] = useState(project?.name || '');
  const [buildCommand, setBuildCommand] = useState(project?.buildCommand || '');
  const [startCommand, setStartCommand] = useState(project?.startCommand || '');
  const [installCommand, setInstallCommand] = useState(project?.installCommand || '');
  const [outputDir, setOutputDir] = useState(project?.outputDir || '');
  const [rootDir, setRootDir] = useState(project?.rootDir || '');
  const [defaultBranch, setDefaultBranch] = useState(project?.defaultBranch || 'main');
  const [framework, setFramework] = useState(project?.framework || '');
  
  // Update form state when project loads
  useEffect(() => {
    if (project) {
      setName(project.name);
      setBuildCommand(project.buildCommand || '');
      setStartCommand(project.startCommand || '');
      setInstallCommand(project.installCommand || '');
      setOutputDir(project.outputDir || '');
      setRootDir(project.rootDir || '');
      setDefaultBranch(project.defaultBranch || 'main');
      setFramework(project.framework || '');
    }
  }, [project]);

  const handleSaveGeneral = async () => {
    try {
      await updateMutation.mutateAsync({
        name,
        buildCommand,
        startCommand,
        installCommand,
        outputDir,
        rootDir,
        defaultBranch,
        framework,
      });
      refetch();
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    if (deleteConfirm !== project.name) {
      return;
    }
    
    try {
      await deleteMutation.mutateAsync(project.slug);
      router.push('/projects');
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading project settings...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Project not found</h2>
          <p className="text-muted-foreground mb-4">The project you're looking for doesn't exist.</p>
          <Link href="/projects">
            <Button>Back to Projects</Button>
          </Link>
        </div>
      </div>
    );
  }

  const repositoryUrl = project.repoUrl || project.repositoryUrl;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/projects/${slug}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold">{project.name}</h1>
              <p className="text-sm text-muted-foreground">Project Settings</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <nav className="lg:w-64 flex-shrink-0">
            <div className="lg:sticky lg:top-6 space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : tab.id === 'danger'
                        ? 'text-destructive hover:bg-destructive/10'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 max-w-3xl">
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">General Settings</h2>
                  <p className="text-sm text-muted-foreground">
                    Configure your project's build and deployment settings.
                  </p>
                </div>

                <div className="space-y-6 border rounded-lg p-6">
                  {/* Project Info */}
                  <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Project Information
                    </h3>
                    
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Project Name</Label>
                        <Input
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="my-awesome-project"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="framework">Framework</Label>
                        <select
                          id="framework"
                          value={framework}
                          onChange={(e) => setFramework(e.target.value)}
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                        >
                          <option value="">Auto-detect</option>
                          {frameworkOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="branch">Default Branch</Label>
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-muted-foreground" />
                          <Input
                            id="branch"
                            value={defaultBranch}
                            onChange={(e) => setDefaultBranch(e.target.value)}
                            placeholder="main"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <hr />

                  {/* Build Settings */}
                  <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      Build & Output Settings
                    </h3>
                    
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="install">Install Command</Label>
                        <Input
                          id="install"
                          value={installCommand}
                          onChange={(e) => setInstallCommand(e.target.value)}
                          placeholder="npm install"
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Command to install dependencies
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="build">Build Command</Label>
                        <Input
                          id="build"
                          value={buildCommand}
                          onChange={(e) => setBuildCommand(e.target.value)}
                          placeholder="npm run build"
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Command to build your project
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="start">Start Command</Label>
                        <Input
                          id="start"
                          value={startCommand}
                          onChange={(e) => setStartCommand(e.target.value)}
                          placeholder="npm start"
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Command to start your application (for server-side apps)
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="output">Output Directory</Label>
                        <div className="flex items-center gap-2">
                          <FolderRoot className="h-4 w-4 text-muted-foreground" />
                          <Input
                            id="output"
                            value={outputDir}
                            onChange={(e) => setOutputDir(e.target.value)}
                            placeholder=".next, dist, build"
                            className="font-mono text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Directory containing the build output
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="root">Root Directory</Label>
                        <div className="flex items-center gap-2">
                          <FolderRoot className="h-4 w-4 text-muted-foreground" />
                          <Input
                            id="root"
                            value={rootDir}
                            onChange={(e) => setRootDir(e.target.value)}
                            placeholder="./"
                            className="font-mono text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Directory containing your source code (if not the repo root)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      onClick={handleSaveGeneral}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Git Repository Info (Read-only) */}
                <div className="border rounded-lg p-6 space-y-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    Connected Repository
                  </h3>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Repository</span>
                      <a
                        href={repositoryUrl}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="font-mono hover:text-primary"
                      >
                        {(repositoryUrl || '').replace('https://github.com/', '')}
                      </a>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Production Branch</span>
                      <span className="font-mono">{project.defaultBranch || 'main'}</span>
                    </div>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    To change the connected repository, delete this project and create a new one.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'environment' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Environment Variables</h2>
                  <p className="text-sm text-muted-foreground">
                    Manage your project's environment variables. Changes will take effect on the next deployment.
                  </p>
                </div>
                <EnvVariables projectId={project.id} projectSlug={project.slug} />
              </div>
            )}

            {activeTab === 'domains' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Domains</h2>
                  <p className="text-sm text-muted-foreground">
                    Configure custom domains for your project. SSL certificates are automatically provisioned.
                  </p>
                </div>
                <Domains projectId={project.id} subdomain={project.subdomain || ''} />
              </div>
            )}

            {activeTab === 'webhooks' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Webhooks</h2>
                  <p className="text-sm text-muted-foreground">
                    Configure webhooks to trigger automatic deployments from your Git provider.
                  </p>
                </div>
                <Webhooks projectId={project.id} />
              </div>
            )}

            {activeTab === 'danger' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1 text-destructive">Danger Zone</h2>
                  <p className="text-sm text-muted-foreground">
                    Irreversible and destructive actions.
                  </p>
                </div>

                <div className="border border-destructive/50 rounded-lg p-6 space-y-6">
                  {/* Transfer Project */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-medium">Transfer Project</h3>
                      <p className="text-sm text-muted-foreground">
                        Transfer this project to another team or personal account.
                      </p>
                    </div>
                    <Button variant="outline" disabled>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Transfer
                    </Button>
                  </div>

                  <hr className="border-destructive/30" />

                  {/* Delete Project */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium text-destructive">Delete Project</h3>
                      <p className="text-sm text-muted-foreground">
                        Once you delete a project, there is no going back. Please be certain.
                      </p>
                    </div>
                    
                    <div className="p-4 bg-destructive/10 rounded-lg space-y-4">
                      <p className="text-sm">
                        This will permanently delete the <strong>{project.name}</strong> project, 
                        all deployments, environment variables, domains, and associated data.
                      </p>
                      
                      <div className="space-y-2">
                        <Label htmlFor="confirmDelete" className="text-sm">
                          Type <strong>{project.name}</strong> to confirm:
                        </Label>
                        <Input
                          id="confirmDelete"
                          value={deleteConfirm}
                          onChange={(e) => setDeleteConfirm(e.target.value)}
                          placeholder={project.name}
                          className="font-mono"
                        />
                      </div>
                      
                      <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={deleteConfirm !== project.name || deleteMutation.isPending}
                        className="w-full sm:w-auto"
                      >
                        {deleteMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete this project
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
