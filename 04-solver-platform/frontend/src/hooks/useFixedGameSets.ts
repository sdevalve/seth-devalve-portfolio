import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type FixedGameSet from '@/entities/FixedGameSet'

const apiClient = new APIClient<FixedGameSet[]>('/fixed-gamesets')

const useFixedGameSets = (season: number | null) =>
  useQuery({
    queryKey: ['fixed-gamesets', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
  })

export default useFixedGameSets
