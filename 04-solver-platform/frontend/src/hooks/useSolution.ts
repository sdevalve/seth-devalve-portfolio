import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Solution from '@/entities/Solution'

const apiClient = new APIClient<Solution>('/solutions')

const useSolution = (solutionId: string | null) =>
  useQuery({
    queryKey: ['solutions', solutionId],
    queryFn: () => apiClient.get(solutionId!),
    enabled: solutionId !== null,
    staleTime: Infinity, // solutions are immutable once stored
  })

export default useSolution
