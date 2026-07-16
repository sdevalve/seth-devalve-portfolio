import { useMutation, useQueryClient } from '@tanstack/react-query'
import { axiosInstance } from '@/services/api-client'
import type ColorPolicy from '@/entities/ColorPolicy'

type Payload = Pick<ColorPolicy, 'slot_colors' | 'palette' | 'tod_formats' | 'dh_format'>

const useSaveColorPolicy = (season: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Payload) =>
      axiosInstance
        .put<ColorPolicy>('/color-policy/', data, { params: { season } })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['color-policy', season] })
    },
  })
}

export default useSaveColorPolicy
