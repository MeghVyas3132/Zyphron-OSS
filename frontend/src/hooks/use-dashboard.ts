'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi, type DashboardMetrics } from '@/lib/api';

// Query keys
export const dashboardKeys = {
  all: ['dashboard'] as const,
  metrics: () => [...dashboardKeys.all, 'metrics'] as const,
};

// Hook for dashboard metrics
export function useDashboardMetrics() {
  return useQuery({
    queryKey: dashboardKeys.metrics(),
    queryFn: dashboardApi.getMetrics,
    // Poll every 30 seconds to keep data fresh
    refetchInterval: 30000,
    // Don't refetch on window focus (can be annoying)
    refetchOnWindowFocus: false,
  });
}
