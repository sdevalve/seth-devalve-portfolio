import { useQuery } from '@tanstack/react-query'
import { axiosInstance } from '@/services/api-client'

const useTeamPopularity = (season: number | null) =>
  useQuery({
    queryKey: ['team-popularity', season],
    queryFn: () =>
      axiosInstance
        .get<{ scores: Record<string, number> }>('/net-cats/popularity', { params: { season } })
        .then((r) => r.data.scores),
    enabled: season !== null,
    staleTime: Infinity,
  })

export default useTeamPopularity
