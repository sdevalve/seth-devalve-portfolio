import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Weekmap from '@/entities/Weekmap'

const apiClient = new APIClient<Weekmap>('/weekmap')

const useWeekmap = (season: number | null) =>
  useQuery({
    queryKey: ['weekmap', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
  })

export default useWeekmap
