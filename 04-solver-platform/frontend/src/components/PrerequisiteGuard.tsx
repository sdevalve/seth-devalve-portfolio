interface Props {
  met: boolean
  message: string
  children: React.ReactNode
}

// Blocks rendering of a page section until a prerequisite condition is met.
// Used to enforce the wizard step ordering (each page requires prior steps completed).
const PrerequisiteGuard = ({ met, message, children }: Props) => {
  if (!met) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center max-w-lg mx-auto mt-12">
        <p className="text-amber-800 font-medium text-sm">{message}</p>
      </div>
    )
  }
  return <>{children}</>
}

export default PrerequisiteGuard
