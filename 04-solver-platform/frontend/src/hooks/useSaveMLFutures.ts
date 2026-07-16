import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type { MLFutures, MLFuturesPlayoff } from '@/entities/MLFutures'

export interface SaveFuturesPayload {
  season: number
  playoffs: Record<string, MLFuturesPlayoff> | null
  wintotals: Record<string, number | null> | null
  division_odds: Record<string, number | null> | null
  conference_odds: Record<string, number | null> | null
  superbowl_odds: Record<string, number | null> | null
}

const apiClient = new APIClient<MLFutures>('/ml-futures')

const useSaveMLFutures = (season: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SaveFuturesPayload) => apiClient.post(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ml-futures', season] })
    },
  })
}

export default useSaveMLFutures
