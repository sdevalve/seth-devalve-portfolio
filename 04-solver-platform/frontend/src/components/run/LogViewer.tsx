interface Props {
  lines: string[]
  maxLines?: number
}

const LogViewer = ({ lines, maxLines = 500 }: Props) => {
  const trimmed = lines.slice(-maxLines)

  return (
    <div className="border border-slate-700 rounded bg-slate-950 text-green-400 font-mono text-[11px] p-2 h-96 overflow-y-auto">
      {trimmed.length === 0 && (
        <span className="text-slate-500">Waiting for Gurobi log output…</span>
      )}
      {trimmed.map((line, i) => (
        <div key={i} className="leading-relaxed whitespace-pre-wrap break-all">
          {line}
        </div>
      ))}
    </div>
  )
}

export default LogViewer
