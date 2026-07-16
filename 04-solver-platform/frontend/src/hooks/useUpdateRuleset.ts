import { useMutation, useQueryClient } from '@tanstack/react-query'
import APIClient from '@/services/api-client'
import type Ruleset from '@/entities/Ruleset'
import type Rule from '@/entities/Rule'

interface UpdateRulesetPayload {
  ruleset_id: string
  rules: Rule[]
  force_overwrite?: boolean
}

const apiClient = new APIClient<Ruleset>('/rulesets')

const useUpdateRuleset = (season: number | null) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleset_id, rules, force_overwrite }: UpdateRulesetPayload) =>
      apiClient.put(ruleset_id, { rules, force_overwrite }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rulesets', season] })
    },
  })
}

export default useUpdateRuleset
