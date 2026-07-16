import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'

export interface SeasonProgress {
  season_settings: boolean
  teams: boolean
  matchups: boolean
  slots_networks: boolean
  slots_weekmap: boolean
  ruleset: boolean
  run: boolean
}

const apiClient = new APIClient<SeasonProgress>('/seasons')

const useSeasonProgress = (year: number | null) =>
  useQuery({
    queryKey: ['progress', year],
    queryFn: () => apiClient.get(`${year}/progress`),
    enabled: year !== null,
    staleTime: 30 * 1000,
  })

export default useSeasonProgress
