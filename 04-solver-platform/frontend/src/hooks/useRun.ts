import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Run from '@/entities/Run'

const apiClient = new APIClient<Run>('/runs')

const useRun = (runId: string | null) =>
  useQuery({
    queryKey: ['runs', runId],
    queryFn: () => apiClient.get(runId!),
    enabled: runId !== null,
    refetchInterval: (query) => {
      // Poll every 5s while the run is actively processing
      const status = query.state.data?.status
      const active = ['queued', 'building', 'solving']
      return status && active.includes(status) ? 5000 : false
    },
  })

export default useRun
