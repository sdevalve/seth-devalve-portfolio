import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Run from '@/entities/Run'

const apiClient = new APIClient<Run[]>('/runs')

const TERMINAL = new Set(['complete', 'failed', 'stopped', 'infeasible'])

const useRuns = (season: number | null) =>
  useQuery({
    queryKey: ['runs', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
    refetchInterval: (query) => {
      const runs = query.state.data
      if (!runs) return false
      return runs.some((r) => !TERMINAL.has(r.status)) ? 3000 : false
    },
  })

export default useRuns
