import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type { MLRematch } from '@/entities/MLRematch'

interface SaveRematchesPayload {
  season: number
  rematches: { away_team: string; home_team: string }[]
}

const apiClient = new APIClient<MLRematch[]>('/ml-rematches')

const useSaveMLRematches = (season: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SaveRematchesPayload) => apiClient.post(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ml-rematches', season] })
    },
  })
}

export default useSaveMLRematches
