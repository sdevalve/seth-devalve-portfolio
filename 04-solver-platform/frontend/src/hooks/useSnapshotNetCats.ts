import { useMutation, useQueryClient } from '@tanstack/react-query'
import { axiosInstance } from '@/services/api-client'
import type { NetCats } from '@/entities/NetCats'

interface SnapshotPayload {
  net_cats_id: string
  name: string
  season: number   // used to invalidate the correct cache key
}

const useSnapshotNetCats = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ net_cats_id, name }: SnapshotPayload) =>
      axiosInstance
        .post<NetCats>(`/net-cats/${net_cats_id}/snapshot`, { name })
        .then((r) => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['net-cats', variables.season] })
    },
  })
}

export default useSnapshotNetCats
