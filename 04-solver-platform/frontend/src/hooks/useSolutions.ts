import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Solution from '@/entities/Solution'

const apiClient = new APIClient<Solution[]>('/solutions')

const useSolutions = (runId: string | null, isLive = false) =>
  useQuery({
    queryKey: ['solutions', runId],
    queryFn: () => apiClient.getAll({ params: { run_id: runId } }),
    enabled: runId !== null,
    refetchInterval: isLive ? 3000 : false,
  })

export default useSolutions
