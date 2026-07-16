import { useMutation, useQueryClient } from '@tanstack/react-query'
import { axiosInstance } from '@/services/api-client'

interface SavePayload {
  season: number
  scores: Record<string, number>
}

const useSaveTeamPopularity = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ season, scores }: SavePayload) =>
      axiosInstance
        .put<{ scores: Record<string, number> }>('/net-cats/popularity', { scores }, { params: { season } })
        .then((r) => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['team-popularity', variables.season] })
    },
  })
}

export default useSaveTeamPopularity
