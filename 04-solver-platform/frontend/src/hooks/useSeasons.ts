import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Season from '@/entities/Season'

const apiClient = new APIClient<Season[]>('/seasons')

const useSeasons = () =>
  useQuery({
    queryKey: ['seasons'],
    queryFn: () => apiClient.getAll(),
    staleTime: 5 * 60 * 1000,
  })

export default useSeasons
