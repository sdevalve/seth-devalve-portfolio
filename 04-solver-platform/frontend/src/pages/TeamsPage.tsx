import { useEffect, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import useTeams from '@/hooks/useTeams'
import useSaveTeams from '@/hooks/useSaveTeams'
import useSeasonStore from '@/store/useSeasonStore'
import PrerequisiteGuard from '@/components/PrerequisiteGuard'
import type Team from '@/entities/Team'

type TeamRow = Omit<Team, 'team_id' | 'season_id'>

const CONFERENCES: Team['conference'][] = ['AFC', 'NFC']
const DIVISIONS: Team['division'][] = ['North', 'South', 'East', 'West']
const TIMEZONE_LABELS = ['Eastern', 'Central', 'Mountain', 'Pacific'] as const
const DEFAULT_ROW: TeamRow = { abbreviation: '', city: '', mascot: '', tv_code: '', conference: 'AFC', division: 'North', timezone: 0 }

// ── All 32 NFL teams, grouped by conference and division (N/S/E/W order) ──
const NFL_DEFAULTS: TeamRow[] = [
  // AFC North — all Eastern
  { abbreviation: 'BAL', city: 'Baltimore',    mascot: 'Ravens',    tv_code: 'RAVEN', conference: 'AFC', division: 'North', timezone: 0 },
  { abbreviation: 'CIN', city: 'Cincinnati',   mascot: 'Bengals',   tv_code: 'BENGL', conference: 'AFC', division: 'North', timezone: 0 },
  { abbreviation: 'CLE', city: 'Cleveland',    mascot: 'Browns',    tv_code: 'BRWNS', conference: 'AFC', division: 'North', timezone: 0 },
  { abbreviation: 'PIT', city: 'Pittsburgh',   mascot: 'Steelers',  tv_code: 'STLRS', conference: 'AFC', division: 'North', timezone: 0 },
  // AFC South
  { abbreviation: 'HOU', city: 'Houston',      mascot: 'Texans',    tv_code: 'TEXAN', conference: 'AFC', division: 'South', timezone: 1 },
  { abbreviation: 'IND', city: 'Indianapolis', mascot: 'Colts',     tv_code: 'COLTS', conference: 'AFC', division: 'South', timezone: 0 },
  { abbreviation: 'JAX', city: 'Jacksonville', mascot: 'Jaguars',   tv_code: 'JAGRS', conference: 'AFC', division: 'South', timezone: 0 },
  { abbreviation: 'TEN', city: 'Tennessee',    mascot: 'Titans',    tv_code: 'TITAN', conference: 'AFC', division: 'South', timezone: 1 },
  // AFC East — all Eastern
  { abbreviation: 'BUF', city: 'Buffalo',      mascot: 'Bills',     tv_code: 'BILLS', conference: 'AFC', division: 'East', timezone: 0 },
  { abbreviation: 'MIA', city: 'Miami',        mascot: 'Dolphins',  tv_code: 'DLPHN', conference: 'AFC', division: 'East', timezone: 0 },
  { abbreviation: 'NE',  city: 'New England',  mascot: 'Patriots',  tv_code: 'PATS',  conference: 'AFC', division: 'East', timezone: 0 },
  { abbreviation: 'NYJ', city: 'New York',     mascot: 'Jets',      tv_code: 'JETS',  conference: 'AFC', division: 'East', timezone: 0 },
  // AFC West
  { abbreviation: 'DEN', city: 'Denver',       mascot: 'Broncos',   tv_code: 'BRNCO', conference: 'AFC', division: 'West', timezone: 2 },
  { abbreviation: 'KC',  city: 'Kansas City',  mascot: 'Chiefs',    tv_code: 'CHIEF', conference: 'AFC', division: 'West', timezone: 1 },
  { abbreviation: 'LAC', city: 'Los Angeles',  mascot: 'Chargers',  tv_code: 'CHRGR', conference: 'AFC', division: 'West', timezone: 3 },
  { abbreviation: 'LV',  city: 'Las Vegas',    mascot: 'Raiders',   tv_code: 'RAIDR', conference: 'AFC', division: 'West', timezone: 3 },
  // NFC North
  { abbreviation: 'CHI', city: 'Chicago',      mascot: 'Bears',     tv_code: 'BEARS', conference: 'NFC', division: 'North', timezone: 1 },
  { abbreviation: 'DET', city: 'Detroit',      mascot: 'Lions',     tv_code: 'LIONS', conference: 'NFC', division: 'North', timezone: 0 },
  { abbreviation: 'GB',  city: 'Green Bay',    mascot: 'Packers',   tv_code: 'PCKRS', conference: 'NFC', division: 'North', timezone: 1 },
  { abbreviation: 'MIN', city: 'Minnesota',    mascot: 'Vikings',   tv_code: 'VIKNG', conference: 'NFC', division: 'North', timezone: 1 },
  // NFC South
  { abbreviation: 'ATL', city: 'Atlanta',      mascot: 'Falcons',   tv_code: 'FALCN', conference: 'NFC', division: 'South', timezone: 0 },
  { abbreviation: 'CAR', city: 'Carolina',     mascot: 'Panthers',  tv_code: 'PNTHR', conference: 'NFC', division: 'South', timezone: 0 },
  { abbreviation: 'NO',  city: 'New Orleans',  mascot: 'Saints',    tv_code: 'SAINT', conference: 'NFC', division: 'South', timezone: 1 },
  { abbreviation: 'TB',  city: 'Tampa Bay',    mascot: 'Buccaneers',tv_code: 'BUCS',  conference: 'NFC', division: 'South', timezone: 0 },
  // NFC East
  { abbreviation: 'DAL', city: 'Dallas',       mascot: 'Cowboys',   tv_code: 'COWBY', conference: 'NFC', division: 'East', timezone: 1 },
  { abbreviation: 'NYG', city: 'New York',     mascot: 'Giants',    tv_code: 'GIANT', conference: 'NFC', division: 'East', timezone: 0 },
  { abbreviation: 'PHI', city: 'Philadelphia', mascot: 'Eagles',    tv_code: 'EAGLE', conference: 'NFC', division: 'East', timezone: 0 },
  { abbreviation: 'WSH', city: 'Washington',   mascot: 'Commanders',tv_code: 'CMNDR', conference: 'NFC', division: 'East', timezone: 0 },
  // NFC West — all Pacific (ARI & LV mapped to Pacific for cross-country travel modeling)
  { abbreviation: 'ARI', city: 'Arizona',      mascot: 'Cardinals', tv_code: 'CARDS', conference: 'NFC', division: 'West', timezone: 3 },
  { abbreviation: 'LAR', city: 'Los Angeles',  mascot: 'Rams',      tv_code: 'RAMS',  conference: 'NFC', division: 'West', timezone: 3 },
  { abbreviation: 'SF',  city: 'San Francisco',mascot: 'Niners',    tv_code: '49RS',  conference: 'NFC', division: 'West', timezone: 3 },
  { abbreviation: 'SEA', city: 'Seattle',      mascot: 'Seahawks',  tv_code: 'SEAHK', conference: 'NFC', division: 'West', timezone: 3 },
]

const COL_DEFS: ColDef<TeamRow>[] = [
  { field: 'abbreviation', headerName: 'Abbr',       editable: true, width: 80 },
  { field: 'city',         headerName: 'City',       editable: true, flex: 1 },
  { field: 'mascot',       headerName: 'Mascot',     editable: true, flex: 1 },
  { field: 'tv_code',      headerName: 'TV Code',    editable: true, width: 100 },
  {
    field: 'conference',
    headerName: 'Conference',
    editable: true,
    width: 120,
    cellEditor: 'agSelectCellEditor',
    cellEditorParams: { values: CONFERENCES },
  },
  {
    field: 'division',
    headerName: 'Division',
    editable: true,
    width: 110,
    cellEditor: 'agSelectCellEditor',
    cellEditorParams: { values: DIVISIONS },
  },
  {
    field: 'timezone',
    headerName: 'Timezone',
    editable: true,
    width: 120,
    cellEditor: 'agSelectCellEditor',
    cellEditorParams: { values: TIMEZONE_LABELS },
    // Display the label; store the integer index
    valueFormatter: (p) => TIMEZONE_LABELS[p.value as number] ?? String(p.value),
    valueParser: (p) => {
      const idx = (TIMEZONE_LABELS as readonly string[]).indexOf(p.newValue)
      return idx >= 0 ? idx : 0
    },
  },
]

const TeamsPage = () => {
  const { selectedSeason } = useSeasonStore()
  const { data: teams, isLoading, isError: teamsError } = useTeams(selectedSeason)
  const saveMutation = useSaveTeams(selectedSeason)
  const gridRef = useRef<AgGridReact<TeamRow>>(null)
  const [rowData, setRowData] = useState<TeamRow[]>([])

  useEffect(() => {
    if (teams !== undefined) {
      if (teams.length > 0) {
        // Season already has saved teams — load them
        setRowData(
          teams.map(({ abbreviation, city, mascot, tv_code, conference, division, timezone }) => ({
            abbreviation,
            city,
            mascot,
            tv_code,
            conference,
            division,
            timezone,
          }))
        )
      } else {
        // No saved teams yet — pre-fill with the 32 NFL defaults
        setRowData(NFL_DEFAULTS.map((r) => ({ ...r })))
      }
    }
  }, [teams])

  const collectRows = (): TeamRow[] => {
    const rows: TeamRow[] = []
    gridRef.current?.api?.forEachNode((node) => {
      if (node.data) rows.push(node.data)
    })
    return rows
  }

  const addRow = () => {
    gridRef.current?.api?.applyTransaction({ add: [{ ...DEFAULT_ROW }] })
    const lastIndex = (gridRef.current?.api?.getDisplayedRowCount() ?? 1) - 1
    gridRef.current?.api?.ensureIndexVisible(lastIndex, 'bottom')
  }

  const removeSelected = () => {
    const selected = gridRef.current?.api?.getSelectedRows() ?? []
    gridRef.current?.api?.applyTransaction({ remove: selected })
  }

  const loadDefaults = () => {
    setRowData(NFL_DEFAULTS.map((r) => ({ ...r })))
  }

  const handleSave = () => {
    const valid = collectRows().filter((r) => r.abbreviation.trim())
    saveMutation.mutate(valid)
  }

  return (
    <PrerequisiteGuard met={!!selectedSeason} message="Select a season before managing teams.">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Teams · {selectedSeason}</h1>
          <div className="flex gap-2">
            <button
              onClick={loadDefaults}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100"
            >
              Load Defaults
            </button>
            <button
              onClick={addRow}
              className="px-3 py-1.5 text-sm bg-slate-800 text-white rounded hover:bg-slate-700"
            >
              + Add Row
            </button>
            <button
              onClick={removeSelected}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100"
            >
              Remove Selected
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || isLoading}
              className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save Teams'}
            </button>
          </div>
        </div>

        {teamsError && (
          <p className="text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Season not found in the database. Go to the Home page and create a season first.
          </p>
        )}

        <div style={{ height: 560 }}>
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={COL_DEFS}
            rowSelection={{ mode: 'multiRow' }}
            stopEditingWhenCellsLoseFocus
            animateRows
          />
        </div>

        {saveMutation.isSuccess && (
          <p className="text-green-600 text-sm">Teams saved ✓</p>
        )}
        {saveMutation.isError && (
          <p className="text-red-500 text-sm">Error saving teams. Check console.</p>
        )}
      </div>
    </PrerequisiteGuard>
  )
}

export default TeamsPage
