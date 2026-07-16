import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Season from '@/entities/Season'
import useSeasonStore from '@/store/useSeasonStore'

const apiClient = new APIClient<Season>('/seasons')

// POSTs { year } to /seasons. On success, refreshes the seasons list
// and auto-selects the new season in the global store.
const useCreateSeason = () => {
  const queryClient = useQueryClient()
  const { setSelectedSeason } = useSeasonStore()

  return useMutation({
    mutationFn: (year: number) => apiClient.post({ year }),
    onSuccess: (newSeason) => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] })
      setSelectedSeason(newSeason.year)
    },
  })
}

export default useCreateSeason
