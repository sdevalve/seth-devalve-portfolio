import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Season from '@/entities/Season'
import type { SeasonFormData } from '@/schemas/seasonSchema'

const apiClient = new APIClient<Season>('/seasons')

// Pass the existing season_id when updating; null to create a new season.
const useSaveSeasonSettings = (seasonId: string | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: SeasonFormData) =>
      seasonId ? apiClient.put(seasonId, data) : apiClient.post(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] })
      queryClient.invalidateQueries({ queryKey: ['progress'] })
    },
  })
}

export default useSaveSeasonSettings
