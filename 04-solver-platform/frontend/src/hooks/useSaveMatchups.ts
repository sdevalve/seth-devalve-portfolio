import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Matchup from '@/entities/Matchup'

type MatchupPayload = { away_team: string; home_team: string }

const apiClient = new APIClient<Matchup[]>('/matchups/bulk')

const useSaveMatchups = (season: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (matchups: MatchupPayload[]) => apiClient.post({ season, matchups }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchups', season] })
      queryClient.invalidateQueries({ queryKey: ['progress', season] })
    },
  })
}

export default useSaveMatchups
