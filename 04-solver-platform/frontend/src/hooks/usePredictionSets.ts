import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type PredictionSet from '@/entities/PredictionSet'

const apiClient = new APIClient<PredictionSet[]>('/prediction-sets')

const usePredictionSets = (season: number | null) =>
  useQuery({
    queryKey: ['prediction-sets', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
  })

export default usePredictionSets
