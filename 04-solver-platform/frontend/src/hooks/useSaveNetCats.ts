import { useMutation, useQueryClient } from '@tanstack/react-query'
import { axiosInstance } from '@/services/api-client'
import type { NetCatEntry, NetCats } from '@/entities/NetCats'

interface SavePayload {
  season: number
  entries: Pick<NetCatEntry, 'slot' | 'operator' | 'games' | 'matchups'>[]
}

const useSaveNetCats = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ season, entries }: SavePayload) =>
      axiosInstance
        .put<NetCats>(`/net-cats/working-copy`, { entries }, { params: { season } })
        .then((r) => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['net-cats', variables.season] })
    },
  })
}

export default useSaveNetCats
