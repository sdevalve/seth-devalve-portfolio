import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type FixedGameSet from '@/entities/FixedGameSet'
import type { FixedGame } from '@/entities/FixedGameSet'

interface SavePayload {
  season: number
  name: string
  source_solution_id: string | null
  games: FixedGame[]
}

const apiClient = new APIClient<FixedGameSet>('/fixed-gamesets')

const useSaveFixedGameSet = (season: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SavePayload) => apiClient.post(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-gamesets', season] })
    },
  })
}

export default useSaveFixedGameSet
