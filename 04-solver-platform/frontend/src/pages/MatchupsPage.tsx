import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import useMatchups from "@/hooks/useMatchups";
import useSaveMatchups from "@/hooks/useSaveMatchups";
import useTeams from "@/hooks/useTeams";
import useSeason from "@/hooks/useSeason";
import useSeasonStore from "@/store/useSeasonStore";
import PrerequisiteGuard from "@/components/PrerequisiteGuard";

interface MatchupRow {
  away_team: string;
  home_team: string;
}

// First-row values that indicate a header row — skip silently
const HEADER_PATTERN = /^(away|home|team|matchup)/i;

const MatchupsPage = () => {
  const { selectedSeason } = useSeasonStore();
  const { data: season } = useSeason(selectedSeason);
  const { data: teams } = useTeams(selectedSeason);
  const { data: matchups } = useMatchups(selectedSeason);
  const saveMutation = useSaveMatchups(selectedSeason);
  const gridRef = useRef<AgGridReact<MatchupRow>>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rowData, setRowData] = useState<MatchupRow[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  // Populate grid once both matchups and season arrive
  useEffect(() => {
    if (matchups === undefined || season === undefined) return;
    if (matchups.length > 0) {
      setRowData(
        matchups.map(({ away_team, home_team }) => ({ away_team, home_team })),
      );
    } else {
      const n = season.num_matchups ?? 272;
      setRowData(
        Array.from({ length: n }, () => ({ away_team: "", home_team: "" })),
      );
    }
  }, [matchups, season]);

  // Build a case-insensitive lookup: any team identifier → canonical mascot name
  const teamLookup = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    teams?.forEach((t) => {
      for (const key of [t.abbreviation, t.city, t.mascot, t.tv_code]) {
        if (key) map[key.toLowerCase()] = t.mascot;
      }
    });
    return map;
  }, [teams]);

  const teamMascots = useMemo<string[]>(
    () => teams?.map((t) => t.mascot) ?? [],
    [teams],
  );

  const colDefs = useMemo<ColDef<MatchupRow>[]>(
    () => [
      {
        field: "away_team",
        headerName: "Away",
        editable: true,
        flex: 1,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: teamMascots },
      },
      {
        field: "home_team",
        headerName: "Home",
        editable: true,
        flex: 1,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: teamMascots },
      },
    ],
    [teamMascots],
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(ws, {
          header: 1,
        }) as unknown[][];

        // Detect and skip a header row (e.g. "Away", "Home")
        const firstRow = rawRows[0];
        const hasHeader =
          Array.isArray(firstRow) &&
          firstRow.some((cell) =>
            HEADER_PATTERN.test(String(cell ?? "").trim()),
          );
        const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

        const errors: string[] = [];
        const newRows: MatchupRow[] = [];

        dataRows.forEach((row, i) => {
          if (!Array.isArray(row)) return;
          const awayRaw = String(row[0] ?? "").trim();
          const homeRaw = String(row[1] ?? "").trim();
          if (!awayRaw && !homeRaw) return; // skip blank rows

          const away = teamLookup[awayRaw.toLowerCase()];
          const home = teamLookup[homeRaw.toLowerCase()];

          if (!away)
            errors.push(`Row ${i + 1}: unrecognized away team "${awayRaw}"`);
          if (!home)
            errors.push(`Row ${i + 1}: unrecognized home team "${homeRaw}"`);

          newRows.push({ away_team: away ?? "", home_team: home ?? "" });
        });

        if (errors.length > 0) {
          setUploadErrors(errors.slice(0, 25));
        } else {
          setUploadErrors([]);
          setRowData(newRows);
        }
      } catch {
        setUploadErrors([
          "Failed to parse file. Make sure it is a valid .csv or .xlsx file.",
        ]);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsArrayBuffer(file);
  };

  const collectRows = (): MatchupRow[] => {
    const rows: MatchupRow[] = [];
    gridRef.current?.api?.forEachNode((node) => {
      if (node.data) rows.push(node.data);
    });
    return rows;
  };

  const handleSave = () => {
    const valid = collectRows().filter((r) => r.away_team && r.home_team);
    saveMutation.mutate(valid);
  };

  const filledCount = rowData.filter((r) => r.away_team && r.home_team).length;
  const expectedCount = season?.num_matchups ?? 272;

  const prerequisitesMet = !!selectedSeason && !!season && !!teams?.length;

  return (
    <PrerequisiteGuard
      met={prerequisitesMet}
      message="Complete Season Settings and Teams before entering matchups."
    >
      <div className="flex flex-col gap-4">
        {/* ── Header row ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Matchups · {selectedSeason}
            </h1>
            <p className="text-sm text-slate-500">
              {filledCount} / {expectedCount} matchups entered
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100"
            >
              Upload CSV / XLSX
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : "Save Matchups"}
            </button>
          </div>
        </div>

        {/* ── Upload validation errors ── */}
        {uploadErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-700 text-sm font-medium mb-1">
              Upload errors. File was not imported:
            </p>
            <ul className="text-red-600 text-xs space-y-0.5 max-h-36 overflow-y-auto">
              {uploadErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
            {uploadErrors.length === 25 && (
              <p className="text-red-500 text-xs mt-1 italic">
                Showing first 25 errors. Fix these and re-upload.
              </p>
            )}
          </div>
        )}

        {/* ── Format hint ── */}
        <p className="text-xs text-slate-400">
          CSV / XLSX: Column A = Away team, Column B = Home team. Any team code
          (abbreviation, city, mascot, or TV code) is accepted and stored as the
          mascot name.
        </p>

        <div style={{ height: 600 }}>
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={colDefs}
            stopEditingWhenCellsLoseFocus
          />
        </div>

        {saveMutation.isSuccess && (
          <p className="text-green-600 text-sm">Matchups saved ✓</p>
        )}
        {saveMutation.isError && (
          <p className="text-red-500 text-sm">
            Error saving matchups. Check console.
          </p>
        )}
      </div>
    </PrerequisiteGuard>
  );
};

export default MatchupsPage;
