import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { axiosInstance } from '@/services/api-client'

const BASE = '/mock-solver-config'

export interface MockSolverConfig {
  id: number
  penalty_only_multiplier: number
  penalty_only_max_gap: number
  multi_objective_multiplier: number
  multi_objective_max_gap: number
}

export default function useMockSolverConfig() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<MockSolverConfig>({
    queryKey: ['mock-solver-config'],
    queryFn: () => axiosInstance.get(BASE + '/').then((r) => r.data),
  })

  const { mutate: update, isPending: isUpdating } = useMutation({
    mutationFn: (payload: Omit<MockSolverConfig, 'id'>) =>
      axiosInstance.put(BASE + '/', payload).then((r) => r.data),
    onSuccess: (updated) => qc.setQueryData(['mock-solver-config'], updated),
  })

  return { data, isLoading, update, isUpdating }
}
