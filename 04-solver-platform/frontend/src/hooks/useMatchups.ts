import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Matchup from '@/entities/Matchup'

const apiClient = new APIClient<Matchup[]>('/matchups')

const useMatchups = (season: number | null) =>
  useQuery({
    queryKey: ['matchups', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
  })

export default useMatchups
