import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type { MLModel } from '@/entities/MLModel'

const apiClient = new APIClient<MLModel>('/ml-model')

const useMLModel = (season: number | null) =>
  useQuery({
    queryKey: ['ml-model', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
    retry: false,
    refetchOnWindowFocus: false,
  })

export default useMLModel
