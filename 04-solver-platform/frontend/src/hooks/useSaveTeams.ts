import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Team from '@/entities/Team'

type TeamPayload = Omit<Team, 'team_id' | 'season_id'>

const apiClient = new APIClient<Team[]>('/teams/bulk')

const useSaveTeams = (season: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (teams: TeamPayload[]) => apiClient.post({ season, teams }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', season] })
      queryClient.invalidateQueries({ queryKey: ['progress', season] })
    },
  })
}

export default useSaveTeams
