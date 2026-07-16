import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Season from '@/entities/Season'

const apiClient = new APIClient<Season>('/seasons')

const useSeason = (year: number | null) =>
  useQuery({
    queryKey: ['seasons', year],
    queryFn: () => apiClient.get(year!),
    enabled: year !== null,
    staleTime: 5 * 60 * 1000,
  })

export default useSeason
