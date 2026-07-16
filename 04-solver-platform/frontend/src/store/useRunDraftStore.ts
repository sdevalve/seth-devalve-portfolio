import { create } from 'zustand'
import type { RunFormData } from '@/schemas/runSchema'

const FORM_DEFAULT: RunFormData = {
  name: '',
  comments: '',
  run_type: 'PenaltyOnly',
  scope: 'Full',
  ruleset_id: '',
  fixed_game_set_id: null,
  prediction_set_id: null,
  net_cats_id: null,
}

interface RunDraftStore {
  formValues: RunFormData
  setFormValues: (values: RunFormData) => void
  clearDraft: () => void
}

const useRunDraftStore = create<RunDraftStore>((set) => ({
  formValues: FORM_DEFAULT,
  setFormValues: (formValues) => set({ formValues }),
  clearDraft: () => set({ formValues: FORM_DEFAULT }),
}))

export default useRunDraftStore
