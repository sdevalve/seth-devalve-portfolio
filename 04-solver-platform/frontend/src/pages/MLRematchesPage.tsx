import { useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import useSeasonStore from '@/store/useSeasonStore'
import PrerequisiteGuard from '@/components/PrerequisiteGuard'
import useMatchups from '@/hooks/useMatchups'
import useTeams from '@/hooks/useTeams'
import useMLRematches from '@/hooks/useMLRematches'
import useSaveMLRematches from '@/hooks/useSaveMLRematches'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RematchRow {
  _id: string
  away_team: string
  home_team: string
}

// ── Page ──────────────────────────────────────────────────────────────────────

const MLRematchesPage = () => {
  const { selectedSeason } = useSeasonStore()
  const { data: matchups } = useMatchups(selectedSeason)
  const { data: teams } = useTeams(selectedSeason)
  const { data: existingRematches } = useMLRematches(selectedSeason)
  const saveMutation = useSaveMLRematches(selectedSeason)

  const gridRef = useRef<AgGridReact<RematchRow>>(null)
  const [rowData, setRowData] = useState<RematchRow[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // Populate grid from saved rematches whenever the query resolves
  useEffect(() => {
    if (existingRematches === undefined) return
    setRowData(
      existingRematches.map((r) => ({
        _id: r.rematch_id,
        away_team: r.away_team,
        home_team: r.home_team,
      }))
    )
  }, [existingRematches])

  const teamMascots = useMemo<string[]>(
    () => teams?.map((t) => t.mascot) ?? [],
    [teams]
  )

  const colDefs = useMemo<ColDef<RematchRow>[]>(
    () => [
      {
        field: 'away_team',
        headerName: 'Away',
        editable: true,
        flex: 1,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: teamMascots },
      },
      {
        field: 'home_team',
        headerName: 'Home',
        editable: true,
        flex: 1,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: teamMascots },
      },
    ],
    [teamMascots]
  )

  // ── Row actions ─────────────────────────────────────────────────────────────

  const handleAddRow = () => {
    setRowData((prev) => [
      ...prev,
      { _id: crypto.randomUUID(), away_team: '', home_team: '' },
    ])
  }

  const handleDeleteSelected = () => {
    const selectedIds = new Set(
      (gridRef.current?.api?.getSelectedRows() ?? []).map((r) => r._id)
    )
    setRowData((prev) => prev.filter((r) => !selectedIds.has(r._id)))
  }

  const collectRows = (): RematchRow[] => {
    const rows: RematchRow[] = []
    gridRef.current?.api?.forEachNode((node) => {
      if (node.data) rows.push(node.data)
    })
    return rows
  }

  // ── Save with validation ─────────────────────────────────────────────────────

  const handleSave = () => {
    const rows = collectRows().filter((r) => r.away_team && r.home_team)

    // Build unordered pair set from full matchups for validation
    const matchupPairs = new Set(
      (matchups ?? []).map((m) => [m.away_team, m.home_team].sort().join('|'))
    )

    const errors: string[] = []
    rows.forEach((r, i) => {
      const key = [r.away_team, r.home_team].sort().join('|')
      if (!matchupPairs.has(key)) {
        errors.push(
          `Row ${i + 1}: ${r.away_team} vs ${r.home_team} is not in the full matchups set`
        )
      }
    })

    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setValidationErrors([])
    saveMutation.mutate({
      season: selectedSeason!,
      rematches: rows.map(({ away_team, home_team }) => ({ away_team, home_team })),
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const filledCount = rowData.filter((r) => r.away_team && r.home_team).length
  const prerequisitesMet = !!selectedSeason && !!matchups?.length

  return (
    <PrerequisiteGuard
      met={prerequisitesMet}
      message="Complete Season Settings, Teams, and Matchups before entering playoff rematches."
    >
      <div className="flex flex-col gap-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Playoff Rematches · {selectedSeason}
            </h1>
            <p className="text-sm text-slate-500">
              {filledCount} rematch{filledCount !== 1 ? 'es' : ''} entered
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddRow}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100"
            >
              + Add Row
            </button>
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50"
            >
              Delete Selected
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save Rematches'}
            </button>
          </div>
        </div>

        {/* ── Validation errors ── */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-700 text-sm font-medium mb-1">
              Validation errors. Correct these before saving:
            </p>
            <ul className="text-red-600 text-xs space-y-0.5">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Hint ── */}
        <p className="text-xs text-slate-400">
          Click a row to select it, then{' '}
          <span className="font-medium">Delete Selected</span> to remove. Each
          rematch must correspond to a matchup in this season. Direction (home/away)
          does not need to match.
        </p>

        {/* ── Grid ── */}
        <div style={{ height: 400 }}>
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={colDefs}
            rowSelection={{ mode: 'multiRow' }}
            stopEditingWhenCellsLoseFocus
          />
        </div>

        {saveMutation.isSuccess && (
          <p className="text-green-600 text-sm">Rematches saved ✓</p>
        )}
        {saveMutation.isError && (
          <p className="text-red-500 text-sm">Error saving rematches. Check console.</p>
        )}
      </div>
    </PrerequisiteGuard>
  )
}

export default MLRematchesPage
