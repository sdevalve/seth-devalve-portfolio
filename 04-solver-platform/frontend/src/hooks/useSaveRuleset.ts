import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Ruleset from '@/entities/Ruleset'
import type Rule from '@/entities/Rule'

interface SaveRulesetPayload {
  season_id: string | null
  name: string
  description?: string
  parent_ruleset_id?: string | null
  is_snapshot: boolean
  rules: Rule[]
}

const apiClient = new APIClient<Ruleset>('/rulesets')

const useSaveRuleset = (season: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SaveRulesetPayload) => apiClient.post(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rulesets', season] })
      queryClient.invalidateQueries({ queryKey: ['progress', season] })
    },
  })
}

export default useSaveRuleset
