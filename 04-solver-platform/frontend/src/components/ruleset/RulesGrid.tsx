import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import type Rule from '@/entities/Rule'
import { CONSTRAINT_TYPES } from '@/schemas/ruleSchema'

export interface RulesGridHandle {
  collectRows: () => Rule[]
}

interface Props {
  rows: Rule[]
  onDirty: () => void
  defaultTeams: string   // comma-joined abbreviations from saved teams
  numWeeks: number
}

const BOOL_VALUES = [0, 1]
const OPERATOR_VALUES = ['Max', 'Min']
const HARD_VALUES = ['', 'hard']

const RulesGrid = forwardRef<RulesGridHandle, Props>(({ rows, onDirty, defaultTeams, numWeeks }, ref) => {
  const gridRef = useRef<AgGridReact<Rule>>(null)

  useImperativeHandle(ref, () => ({
    collectRows: () => {
      const collected: Rule[] = []
      gridRef.current?.api?.forEachNode((node) => {
        if (node.data) collected.push(node.data)
      })
      return collected
    },
  }))

  const colDefs: ColDef<Rule>[] = useMemo(() => [
    {
      colId: 'rowNum',
      headerName: '#',
      width: 50,
      editable: false,
      sortable: false,
      filter: false,
      valueGetter: (params) => params.node?.rowIndex != null ? params.node.rowIndex + 1 : '',
    },
    {
      field: 'active',
      headerName: 'Active',
      width: 72,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: BOOL_VALUES },
    },
    {
      field: 'operator',
      headerName: 'Op',
      width: 72,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: OPERATOR_VALUES },
    },
    { field: 'games', headerName: 'Games', width: 72, editable: true, type: 'numericColumn' },
    { field: 'weeks', headerName: 'Weeks', width: 80, editable: true },
    { field: 'week_start', headerName: 'Wk Start', width: 80, editable: true },
    { field: 'week_end', headerName: 'Wk End', width: 80, editable: true },
    { field: 'slot', headerName: 'Slot', width: 140, editable: true },
    { field: 'penalty', headerName: 'Penalty', width: 80, editable: true, type: 'numericColumn' },
    {
      field: 'constraint_type',
      headerName: 'Type',
      width: 180,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: CONSTRAINT_TYPES },
    },
    {
      field: 'hard',
      headerName: 'Hard',
      width: 72,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: HARD_VALUES },
    },
    {
      field: 'penalty_cap',
      headerName: 'PenCap',
      width: 72,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: BOOL_VALUES },
    },
    { field: 'comment', headerName: 'Comment', flex: 1, minWidth: 160, editable: true },
    { field: 'slack_bound', headerName: 'SlackBnd', width: 88, editable: true, type: 'numericColumn' },
    {
      field: 'ti',
      headerName: 'TI',
      width: 56,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: BOOL_VALUES },
    },
    { field: 'teams', headerName: 'Teams', width: 200, editable: true },
  ], [])

  const defaultRow = useMemo((): Rule => ({
    active: 1,
    operator: 'Max',
    games: 1,
    weeks: 1,
    week_start: 1,
    week_end: numWeeks,
    slot: '',
    penalty: 1,
    constraint_type: 'Team/Slot/Week',
    hard: '',
    penalty_cap: 0,
    comment: '',
    slack_bound: 0,
    ti: 0,
    teams: defaultTeams,
  }), [defaultTeams, numWeeks])

  const addRow = () => {
    gridRef.current?.api?.applyTransaction({ add: [{ ...defaultRow }] })
    const lastIndex = (gridRef.current?.api?.getDisplayedRowCount() ?? 1) - 1
    gridRef.current?.api?.ensureIndexVisible(lastIndex, 'bottom')
    onDirty()
  }

  const removeSelected = () => {
    const selected = gridRef.current?.api?.getSelectedRows() ?? []
    gridRef.current?.api?.applyTransaction({ remove: selected })
    onDirty()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={addRow}
          className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded hover:bg-slate-700"
        >
          + Add Rule
        </button>
        <button
          type="button"
          onClick={removeSelected}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
        >
          Remove Selected
        </button>
      </div>
      <div style={{ height: 480 }}>
        <AgGridReact
          ref={gridRef}
          rowData={rows}
          columnDefs={colDefs}
          rowSelection="multiple"
          stopEditingWhenCellsLoseFocus
          onCellValueChanged={() => onDirty()}
        />
      </div>
    </div>
  )
})

export default RulesGrid
