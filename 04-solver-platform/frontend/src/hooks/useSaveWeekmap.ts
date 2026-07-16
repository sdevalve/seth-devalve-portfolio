import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Weekmap from '@/entities/Weekmap'

const apiClient = new APIClient<Weekmap>('/weekmap')

const useSaveWeekmap = (season: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, (string | null)[]>) =>
      apiClient.post({ season, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekmap', season] })
      queryClient.invalidateQueries({ queryKey: ['progress', season] })
    },
  })
}

export default useSaveWeekmap
