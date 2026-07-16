import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type { MLFutures } from '@/entities/MLFutures'

const apiClient = new APIClient<MLFutures>('/ml-futures')

const useMLFutures = (season: number | null) =>
  useQuery({
    queryKey: ['ml-futures', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
    retry: false, // 404 = no data yet — don't retry
    refetchOnWindowFocus: false, // prevent file-dialog close from wiping local unsaved state
  })

export default useMLFutures
