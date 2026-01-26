import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export interface DatabaseBranch {
  id: string;
  name: string;
  parentDatabaseId: string;
  parentBranchId?: string;
  projectId: string;
  connectionString: string;
  type: 'postgresql' | 'mysql' | 'mongodb';
  status: 'creating' | 'active' | 'syncing' | 'error' | 'deleted';
  size: number;
  lastSyncedAt?: string;
  expiresAt?: string;
  metadata: {
    pullRequestId?: string;
    previewUrl?: string;
    createdBy: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseBranchInfo {
  branch: DatabaseBranch;
  parentBranch?: DatabaseBranch;
  childBranches: DatabaseBranch[];
  syncStatus: {
    behind: number;
    ahead: number;
    conflicts: boolean;
  };
  stats: {
    tables: number;
    rows: number;
    size: number;
  };
}

export interface CreateBranchInput {
  name: string;
  parentDatabaseId: string;
  parentBranchId?: string;
  projectId: string;
  expiresAt?: string;
  metadata?: {
    pullRequestId?: string;
    previewUrl?: string;
  };
}

export interface SyncBranchInput {
  direction: 'pull' | 'push';
  resolveConflicts?: 'ours' | 'theirs' | 'manual';
}

export interface MergeBranchInput {
  targetBranchId: string;
  strategy: 'fast-forward' | 'squash' | 'rebase';
  deleteAfterMerge?: boolean;
}

export interface ForkDatabaseInput {
  name: string;
  projectId: string;
  type: 'postgresql' | 'mysql' | 'mongodb';
  sourceConnectionString?: string;
  region?: string;
}

// Hooks

// Get all branches for a project
export function useDatabaseBranches(projectId: string) {
  return useQuery({
    queryKey: ['database-branches', projectId],
    queryFn: async () => {
      const response = await api.get<{ branches: DatabaseBranch[] }>(
        `/db-branches?projectId=${projectId}`
      );
      return response.branches;
    },
    enabled: !!projectId,
  });
}

// Get all branches for a specific database
export function useDatabaseBranchesForDatabase(databaseId: string) {
  return useQuery({
    queryKey: ['database-branches', 'database', databaseId],
    queryFn: async () => {
      const response = await api.get<{ branches: DatabaseBranch[] }>(
        `/db-branches?databaseId=${databaseId}`
      );
      return response.branches;
    },
    enabled: !!databaseId,
  });
}

// Get a single branch with detailed info
export function useDatabaseBranch(branchId: string) {
  return useQuery({
    queryKey: ['database-branch', branchId],
    queryFn: async () => {
      const response = await api.get<DatabaseBranchInfo>(
        `/db-branches/${branchId}`
      );
      return response;
    },
    enabled: !!branchId,
  });
}

// Create a new branch
export function useCreateDatabaseBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBranchInput) => {
      const response = await api.post<{ branch: DatabaseBranch }>(
        '/db-branches',
        input
      );
      return response.branch;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['database-branches', data.projectId] });
      queryClient.invalidateQueries({ 
        queryKey: ['database-branches', 'database', data.parentDatabaseId] 
      });
    },
  });
}

// Delete a branch
export function useDeleteDatabaseBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ branchId, projectId }: { branchId: string; projectId: string }) => {
      await api.delete(`/db-branches/${branchId}`);
      return { branchId, projectId };
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['database-branches', projectId] });
    },
  });
}

// Sync branch with parent
export function useSyncDatabaseBranch(branchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SyncBranchInput) => {
      const response = await api.post<{ 
        branch: DatabaseBranch;
        syncResult: {
          success: boolean;
          changesApplied: number;
          conflicts?: Array<{ table: string; row: string }>;
        };
      }>(`/db-branches/${branchId}/sync`, input);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['database-branch', branchId] });
      queryClient.invalidateQueries({ queryKey: ['database-branches', data.branch.projectId] });
    },
  });
}

// Merge branch into target
export function useMergeDatabaseBranch(branchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MergeBranchInput) => {
      const response = await api.post<{
        success: boolean;
        targetBranch: DatabaseBranch;
        mergeResult: {
          changesApplied: number;
          deletedSourceBranch: boolean;
        };
      }>(`/db-branches/${branchId}/merge`, input);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['database-branches'] });
      queryClient.invalidateQueries({ queryKey: ['database-branch', branchId] });
      queryClient.invalidateQueries({ 
        queryKey: ['database-branch', data.targetBranch.id] 
      });
    },
  });
}

// Fork a database (create new database as branch source)
export function useForkDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ForkDatabaseInput) => {
      const response = await api.post<{ database: DatabaseBranch }>(
        '/db-branches/fork',
        input
      );
      return response.database;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['database-branches', data.projectId] });
      queryClient.invalidateQueries({ queryKey: ['databases'] });
    },
  });
}

// Get branch diff (changes between branch and parent)
export function useDatabaseBranchDiff(branchId: string) {
  return useQuery({
    queryKey: ['database-branch-diff', branchId],
    queryFn: async () => {
      const response = await api.get<{
        diff: {
          tables: Array<{
            name: string;
            action: 'added' | 'modified' | 'deleted';
            rowsAffected: number;
          }>;
          totalChanges: number;
        };
      }>(`/db-branches/${branchId}/diff`);
      return response.diff;
    },
    enabled: !!branchId,
  });
}

// Reset branch to parent state
export function useResetDatabaseBranch(branchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ branch: DatabaseBranch }>(
        `/db-branches/${branchId}/reset`
      );
      return response.branch;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['database-branch', branchId] });
      queryClient.invalidateQueries({ queryKey: ['database-branches', data.projectId] });
    },
  });
}

// Get branch connection info
export function useDatabaseBranchConnection(branchId: string) {
  return useQuery({
    queryKey: ['database-branch-connection', branchId],
    queryFn: async () => {
      const response = await api.get<{
        connectionString: string;
        host: string;
        port: number;
        database: string;
        username: string;
        sslRequired: boolean;
      }>(`/db-branches/${branchId}/connection`);
      return response;
    },
    enabled: !!branchId,
  });
}

// Extend branch expiration
export function useExtendDatabaseBranch(branchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (expiresAt: string) => {
      const response = await api.patch<{ branch: DatabaseBranch }>(
        `/db-branches/${branchId}`,
        { expiresAt }
      );
      return response.branch;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['database-branch', branchId] });
      queryClient.invalidateQueries({ queryKey: ['database-branches', data.projectId] });
    },
  });
}
