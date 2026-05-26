'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Users, Plus, Settings, ExternalLink, FolderGit2, 
  Crown, Shield, Code, Eye, MoreVertical, Trash2,
  UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  useTeams, useCreateTeam, useDeleteTeam,
  type Team
} from '@/hooks/use-teams';

export default function TeamsPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [selectedTeamMenu, setSelectedTeamMenu] = useState<string | null>(null);

  const { data, isLoading, error } = useTeams();
  const createTeam = useCreateTeam();
  const deleteTeam = useDeleteTeam();

  const teams = data?.teams || [];

  const handleCreate = async () => {
    if (!newTeamName.trim()) return;

    try {
      await createTeam.mutateAsync({
        name: newTeamName,
        description: newTeamDescription || undefined,
      });
      setNewTeamName('');
      setNewTeamDescription('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create team:', error);
    }
  };

  const handleDelete = async (teamId: string) => {
    if (!confirm('Are you sure you want to delete this team? This action cannot be undone.')) {
      return;
    }
    await deleteTeam.mutateAsync(teamId);
    setSelectedTeamMenu(null);
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'OWNER': return <Crown className="h-4 w-4 text-white/55" />;
      case 'ADMIN': return <Shield className="h-4 w-4 text-white/45" />;
      case 'DEVELOPER': return <Code className="h-4 w-4 text-white/45" />;
      case 'VIEWER': return <Eye className="h-4 w-4 text-white/35" />;
      default: return null;
    }
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      OWNER: 'border-white/15 text-white/75',
      ADMIN: 'border-white/12 text-white/60',
      DEVELOPER: 'border-white/12 text-white/60',
      VIEWER: 'border-white/10 text-white/45',
    };
    return colors[role] || 'border-white/10 text-white/45';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono-ui text-[9px] uppercase tracking-[0.35em] text-white/25 mb-2">Collaboration</div>
          <h1 className="text-3xl font-semibold tracking-tight">Teams</h1>
          <p className="text-white/45 mt-1">
            Collaborate with your team on projects
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Team
        </Button>
      </div>

      {/* Create Team Dialog */}
      {isCreating && (
        <div className="zy-panel p-6 space-y-4">
          <h3 className="font-semibold">Create New Team</h3>
          
          <div className="space-y-2">
            <Label htmlFor="team-name">Team Name</Label>
            <Input
              id="team-name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="e.g., Engineering"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-description">Description (optional)</Label>
            <Input
              id="team-description"
              value={newTeamDescription}
              onChange={(e) => setNewTeamDescription(e.target.value)}
              placeholder="What does this team work on?"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCreate}
              disabled={!newTeamName.trim() || createTeam.isPending}
            >
              {createTeam.isPending ? 'Creating...' : 'Create Team'}
            </Button>
            <Button variant="outline" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-500">Failed to load teams</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && teams.length === 0 && (
        <div className="zy-panel p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-white/20 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
          <p className="text-white/45 mb-4">
            Create a team to collaborate with others on projects.
          </p>
          <Button onClick={() => setIsCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Your First Team
          </Button>
        </div>
      )}

      {/* Teams Grid */}
      {!isLoading && !error && teams.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team: Team) => (
            <div
              key={team.id}
              className="zy-panel overflow-hidden hover:border-white/20 transition-colors"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg border border-white/10 bg-white/[0.02] flex items-center justify-center">
                      <span className="text-xl font-semibold text-white/70">
                        {team.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold">{team.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {getRoleIcon(team.role)}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getRoleBadge(team.role)}`}>
                          {team.role}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Menu */}
                  {team.role === 'OWNER' && (
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTeamMenu(selectedTeamMenu === team.id ? null : team.id)}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      {selectedTeamMenu === team.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 rounded-md border bg-popover shadow-lg z-10">
                          <Link
                            href={`/teams/${team.id}/settings`}
                            className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted"
                            onClick={() => setSelectedTeamMenu(null)}
                          >
                            <Settings className="h-4 w-4" />
                            Settings
                          </Link>
                          <Link
                            href={`/teams/${team.id}/members`}
                            className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted"
                            onClick={() => setSelectedTeamMenu(null)}
                          >
                            <UserPlus className="h-4 w-4" />
                            Manage Members
                          </Link>
                          <button
                            onClick={() => handleDelete(team.id)}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 w-full text-left"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete Team
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {team.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {team.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{team._count.members} members</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FolderGit2 className="h-4 w-4" />
                    <span>{team._count.projects} projects</span>
                  </div>
                </div>
              </div>

              <div className="px-6 py-3 border-t border-white/[0.06] bg-white/[0.01] flex items-center justify-between">
                <span className="text-xs text-white/35">
                  Owner: {team.owner.name || team.owner.email}
                </span>
                <Link href={`/teams/${team.id}`}>
                  <Button variant="ghost" size="sm" className="gap-1">
                    View
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
