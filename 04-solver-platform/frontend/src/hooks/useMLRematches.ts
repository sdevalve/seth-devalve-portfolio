import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type { MLRematch } from '@/entities/MLRematch'

const apiClient = new APIClient<MLRematch[]>('/ml-rematches')

const useMLRematches = (season: number | null) =>
  useQuery({
    queryKey: ['ml-rematches', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
  })

export default useMLRematches
