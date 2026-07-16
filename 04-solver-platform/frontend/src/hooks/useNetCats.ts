import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type { NetCats } from '@/entities/NetCats'

const apiClient = new APIClient<NetCats[]>('/net-cats')

const useNetCats = (season: number | null) =>
  useQuery({
    queryKey: ['net-cats', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
    refetchOnWindowFocus: false,
  })

export default useNetCats
