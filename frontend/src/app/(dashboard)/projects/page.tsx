'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, GitBranch, Globe, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/utils';
import { useProjects } from '@/hooks/use-projects';
import type { Project } from '@/lib/api';

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
  static: '📄',
  docker: '🐳',
  unknown: '📦',
};

export default function ProjectsPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error, refetch } = useProjects();

  const projects = data?.data || [];
  
  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.slug.toLowerCase().includes(search.toLowerCase())
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
          {error instanceof Error ? error.message : 'Failed to load projects'}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage and deploy your applications
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/projects/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {search ? 'No projects found matching your search' : 'No projects yet'}
          </p>
          {!search && (
            <Link href="/projects/new">
              <Button className="mt-4">Create Your First Project</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const frameworkIcon = frameworkIcons[project.framework || 'unknown'] || '📦';

  return (
    <Link href={`/projects/${project.slug}`}>
      <div className="rounded-lg border bg-card p-6 hover:border-primary transition-colors cursor-pointer group">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{frameworkIcon}</span>
            <div>
              <h3 className="font-semibold group-hover:text-primary transition-colors">
                {project.name}
              </h3>
              <p className="text-sm text-muted-foreground">{project.slug}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.preventDefault()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>{project.defaultBranch || 'main'}</span>
          </div>

          {project.productionUrl && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span className="truncate">{project.productionUrl.replace('https://', '').replace('http://', '')}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              {project.lastDeployedAt
                ? `Deployed ${formatRelativeTime(project.lastDeployedAt)}`
                : 'No deployments yet'}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {project._count?.deployments || 0} deployments
          </span>
          <span className="text-primary font-medium">View →</span>
        </div>
      </div>
    </Link>
  );
}
