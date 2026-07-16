import { cn } from '@/lib/utils'

interface Props {
  complete: boolean
  label?: string
}

const StepStatusBadge = ({ complete, label }: Props) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      complete ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'
    )}
  >
    {complete ? '✓' : '○'} {label ?? (complete ? 'Done' : 'Pending')}
  </span>
)

export default StepStatusBadge
