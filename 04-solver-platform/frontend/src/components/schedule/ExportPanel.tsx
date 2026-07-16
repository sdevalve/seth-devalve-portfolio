interface ExportPanelProps {
  solutionId: string
}

const ExportPanel = ({ solutionId: _ }: ExportPanelProps) => (
  <div className="border border-slate-200 rounded-lg bg-slate-50 px-4 py-3 text-sm">
    <p className="text-slate-500">
      Excel export requires the proprietary schedule analysis module and is not available in this
      portfolio demo.
    </p>
    <button
      disabled
      className="mt-3 px-3 py-1.5 text-sm bg-slate-800 text-white rounded opacity-50 cursor-not-allowed"
    >
      Download Analysis
    </button>
  </div>
)

export default ExportPanel
