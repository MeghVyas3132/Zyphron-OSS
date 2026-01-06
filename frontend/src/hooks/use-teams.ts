'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// ===========================================
// TYPES
// ===========================================

export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatarUrl?: string;
  ownerId: string;
  role: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';
  owner: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  _count: {
    members: number;
    projects: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';
  isOwner: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  createdAt: string;
}

export interface CreateTeamInput {
  name: string;
  description?: string;
  slug?: string;
}

export interface InviteMemberInput {
  email: string;
  role: 'ADMIN' | 'DEVELOPER' | 'VIEWER';
}

// ===========================================
// LIST TEAMS
// ===========================================

export function useTeams(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['teams', page, limit],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/teams?page=${page}&limit=${limit}`);
      return data.data;
    },
  });
}

// ===========================================
// GET TEAM DETAILS
// ===========================================

export function useTeam(teamId: string) {
  return useQuery({
    queryKey: ['teams', teamId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/teams/${teamId}`);
      return data.data as Team;
    },
    enabled: !!teamId,
  });
}

// ===========================================
// GET TEAM MEMBERS
// ===========================================

export function useTeamMembers(teamId: string) {
  return useQuery({
    queryKey: ['teams', teamId, 'members'],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/teams/${teamId}/members`);
      return data.data as TeamMember[];
    },
    enabled: !!teamId,
  });
}

// ===========================================
// GET TEAM PROJECTS
// ===========================================

export function useTeamProjects(teamId: string, page = 1, limit = 20) {
  return useQuery({
    queryKey: ['teams', teamId, 'projects', page, limit],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/teams/${teamId}/projects?page=${page}&limit=${limit}`);
      return data.data;
    },
    enabled: !!teamId,
  });
}

// ===========================================
// CREATE TEAM
// ===========================================

export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTeamInput) => {
      const { data } = await api.post('/api/v1/teams', input);
      return data.data as Team;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team created successfully');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create team');
    },
  });
}

// ===========================================
// UPDATE TEAM
// ===========================================

export function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ teamId, ...input }: { teamId: string; name?: string; description?: string; avatarUrl?: string | null }) => {
      const { data } = await api.patch(`/api/v1/teams/${teamId}`, input);
      return data.data as Team;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['teams', variables.teamId] });
      toast.success('Team updated successfully');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update team');
    },
  });
}

// ===========================================
// DELETE TEAM
// ===========================================

export function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (teamId: string) => {
      await api.delete(`/api/v1/teams/${teamId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team deleted successfully');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to delete team');
    },
  });
}

// ===========================================
// INVITE MEMBER
// ===========================================

export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ teamId, ...input }: InviteMemberInput & { teamId: string }) => {
      const { data } = await api.post(`/api/v1/teams/${teamId}/members`, input);
      return data.data as TeamMember;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['teams', variables.teamId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['teams', variables.teamId] });
      toast.success('Member invited successfully');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to invite member');
    },
  });
}

// ===========================================
// UPDATE MEMBER ROLE
// ===========================================

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ teamId, memberId, role }: { teamId: string; memberId: string; role: 'ADMIN' | 'DEVELOPER' | 'VIEWER' }) => {
      const { data } = await api.patch(`/api/v1/teams/${teamId}/members/${memberId}`, { role });
      return data.data as TeamMember;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['teams', variables.teamId, 'members'] });
      toast.success('Member role updated');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update member role');
    },
  });
}

// ===========================================
// REMOVE MEMBER
// ===========================================

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ teamId, memberId }: { teamId: string; memberId: string }) => {
      await api.delete(`/api/v1/teams/${teamId}/members/${memberId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['teams', variables.teamId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['teams', variables.teamId] });
      toast.success('Member removed from team');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to remove member');
    },
  });
}

// ===========================================
// TRANSFER OWNERSHIP
// ===========================================

export function useTransferOwnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ teamId, newOwnerId }: { teamId: string; newOwnerId: string }) => {
      await api.post(`/api/v1/teams/${teamId}/transfer-ownership`, { newOwnerId });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['teams', variables.teamId] });
      toast.success('Ownership transferred successfully');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to transfer ownership');
    },
  });
}
