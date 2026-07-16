import { useQuery } from '@tanstack/react-query'
import { axiosInstance } from '@/services/api-client'
import type ColorPolicy from '@/entities/ColorPolicy'

const useColorPolicy = (season: number | null) =>
  useQuery({
    queryKey: ['color-policy', season],
    queryFn: () =>
      axiosInstance
        .get<ColorPolicy>('/color-policy/', { params: { season } })
        .then((r) => r.data),
    enabled: season !== null,
  })

export default useColorPolicy
