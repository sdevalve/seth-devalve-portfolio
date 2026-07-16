import { useQuery } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Ruleset from '@/entities/Ruleset'

const apiClient = new APIClient<Ruleset[]>('/rulesets')

// Fetches rulesets for a season plus evergreen (season_id = null) rulesets.
const useRulesets = (season: number | null) =>
  useQuery({
    queryKey: ['rulesets', season],
    queryFn: () => apiClient.getAll({ params: { season } }),
    enabled: season !== null,
  })

export default useRulesets
