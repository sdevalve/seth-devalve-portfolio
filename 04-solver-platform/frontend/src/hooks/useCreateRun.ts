import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Run from '@/entities/Run'
import type { RunFormData } from '@/schemas/runSchema'

const apiClient = new APIClient<Run>('/runs')

export type RunPayload = RunFormData & {
  warm_start_solution_id?: string | null
  perturbate_if_infeasible?: boolean
  perturbation_time_limit?: number
  skip_feasibility_check?: boolean
}

const useCreateRun = (season: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: RunPayload) => apiClient.post({ ...data, season_id: season }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', season] })
    },
  })
}

export default useCreateRun
