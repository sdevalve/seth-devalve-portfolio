import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Team from '@/entities/Team'

const apiClient = new APIClient<Team[]>('/teams')

const useTeams = (season: number | null) =>
  useQuery({
    queryKey: ['teams', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
    refetchOnWindowFocus: false,
  })

export default useTeams
