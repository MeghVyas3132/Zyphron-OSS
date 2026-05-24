'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, Search, MoreHorizontal, GitBranch, Globe, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/utils';
import { useProjects } from '@/hooks/use-projects';
import type { Project } from '@/lib/api';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.19, 1, 0.22, 1] as const } },
};

const frameworkIcons: Record<string, string> = {
  nextjs: '▲',
  react: 'React',
  vue: 'Vue',
  nuxt: 'Vue',
  svelte: 'Svelte',
  sveltekit: 'Svelte',
  angular: 'Angular',
  express: 'Node',
  fastify: 'Node',
  nestjs: 'Nest',
  flask: 'Python',
  django: 'Python',
  fastapi: 'Python',
  go: 'Go',
  rust: 'Rust',
  static: 'Static',
  docker: 'Docker',
  unknown: 'Package',
};

export default function ProjectsPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error, refetch } = useProjects();

  const projectsData = data?.data;
  const projects: Project[] = Array.isArray(projectsData)
    ? projectsData
    : (
        projectsData &&
        typeof projectsData === 'object' &&
        'projects' in projectsData &&
        Array.isArray((projectsData as { projects?: unknown }).projects)
          ? ((projectsData as { projects: Project[] }).projects || [])
          : []
      );
  
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
      <div className="flex items-center justify-between stagger-in">
        <div>
          <h1 className="text-3xl font-semibold mono-text-gradient">Projects</h1>
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
      <div className="premium-panel p-3 max-w-md stagger-in animate-delay-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 rounded-xl"
          />
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="premium-panel text-center py-16"
        >
          <p className="text-muted-foreground">
            {search ? 'No projects found matching your search' : 'No projects yet'}
          </p>
          {!search && (
            <Link href="/projects/new">
              <Button className="mt-4">Create Your First Project</Button>
            </Link>
          )}
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {filteredProjects.map((project) => (
            <motion.div key={project.id} variants={cardVariants}>
              <ProjectCard project={project} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const framework = project.framework || 'unknown';
  const frameworkIcon = frameworkIcons[framework] || 'Package';
  const frameworkAbbr = framework.toUpperCase().slice(0, 3);

  return (
    <Link href={`/projects/${project.slug}`}>
      <div className="premium-panel premium-card-hover p-6 cursor-pointer group">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-foreground/10 flex items-center justify-center border border-foreground/15">
              <span className="text-[11px] font-semibold tracking-wide">{frameworkAbbr}</span>
            </div>
            <div>
              <h3 className="font-semibold group-hover:opacity-75 transition-opacity">
                {project.name}
              </h3>
              <p className="text-xs text-muted-foreground uppercase tracking-[0.16em] mt-1">
                {frameworkIcon} {project.slug}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.preventDefault()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>{project.branch || 'main'}</span>
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

        <div className="mt-4 pt-4 border-t border-border/70 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {project._count?.deployments || 0} deployments
          </span>
          <span className="font-medium">View →</span>
        </div>
      </div>
    </Link>
  );
}
