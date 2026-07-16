import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Season from '@/entities/Season'

const apiClient = new APIClient<Season>('/seasons')

const useSaveSlotsNetworks = (seasonId: string | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { slots: string[]; networks: string[]; new_network_dict: Record<string, string> }) =>
      seasonId
        ? apiClient.put(seasonId, data)
        : Promise.reject(new Error('No season selected')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] })
      queryClient.invalidateQueries({ queryKey: ['progress'] })
    },
  })
}

export default useSaveSlotsNetworks
