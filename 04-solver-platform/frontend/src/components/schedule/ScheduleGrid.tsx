import ScheduleCell from "./ScheduleCell";
import type { ScheduleRecord } from "@/entities/Solution";
import type Team from "@/entities/Team";
import type ColorPolicy from "@/entities/ColorPolicy";
import { dhStyle } from "@/utils/colorPolicy";

interface Props {
  teams: Team[];
  records: ScheduleRecord[];
  numWeeks: number;
  colorPolicy: ColorPolicy | null;
  dhByWeek: Record<string, string> | null;
  fixedPairKeys?: Set<string>;
  fixGamesMode?: boolean;
  onToggleFixed?: (pairKey: string) => void;
}

// NOTE: Hardcoded canonical NFL scheduling order. Update if teams are added/renamed.
const MASCOT_ORDER: Record<string, number> = {
  Cowboys: 0,
  Giants: 1,
  Eagles: 2,
  Commanders: 3, // NFC East
  Bears: 4,
  Lions: 5,
  Packers: 6,
  Vikings: 7, // NFC North
  Falcons: 8,
  Panthers: 9,
  Saints: 10,
  Buccaneers: 11, // NFC South
  Cardinals: 12,
  Rams: 13,
  Niners: 14,
  Seahawks: 15, // NFC West
  Bills: 16,
  Dolphins: 17,
  Patriots: 18,
  Jets: 19, // AFC East
  Ravens: 20,
  Bengals: 21,
  Browns: 22,
  Steelers: 23, // AFC North
  Texans: 24,
  Colts: 25,
  Jaguars: 26,
  Titans: 27, // AFC South
  Broncos: 28,
  Chiefs: 29,
  Raiders: 30,
  Chargers: 31, // AFC West
};

const CONF_ORDER: Record<string, number> = { NFC: 0, AFC: 1 };
const DIV_ORDER: Record<string, number> = {
  East: 0,
  North: 1,
  South: 2,
  West: 3,
};

// Canonical sort key for a matchup pair — order-independent.
function pairKey(teamA: string, teamB: string, week: number): string {
  const [lo, hi] = [teamA, teamB].sort();
  return `${week}|${lo}|${hi}`;
}

// Build a lookup: abbr → { week → { slot, tod, opponent, isHome } }
type CellData = {
  slot: string;
  tod: number | null;
  opponent: string;
  isHome: boolean;
};
type GridLookup = Record<string, Record<number, CellData>>;

function buildLookup(records: ScheduleRecord[]): GridLookup {
  const lookup: GridLookup = {};
  for (const r of records) {
    if (!lookup[r.home]) lookup[r.home] = {};
    if (!lookup[r.away]) lookup[r.away] = {};
    lookup[r.home][r.week] = {
      slot: r.slot,
      tod: r.tod,
      opponent: r.away,
      isHome: true,
    };
    lookup[r.away][r.week] = {
      slot: r.slot,
      tod: r.tod,
      opponent: r.home,
      isHome: false,
    };
  }
  return lookup;
}

const ScheduleGrid = ({
  teams,
  records,
  numWeeks,
  colorPolicy,
  dhByWeek,
  fixedPairKeys = new Set(),
  fixGamesMode = false,
  onToggleFixed,
}: Props) => {
  const lookup = buildLookup(records);
  const weeks = Array.from({ length: numWeeks }, (_, i) => i + 1);
  const dhLabelStyle = dhStyle(colorPolicy);

  const sortedTeams = [...teams].sort((a, b) => {
    const ai =
      MASCOT_ORDER[a.mascot] ??
      1000 +
        (CONF_ORDER[a.conference] ?? 0) * 10 +
        (DIV_ORDER[a.division] ?? 0);
    const bi =
      MASCOT_ORDER[b.mascot] ??
      1000 +
        (CONF_ORDER[b.conference] ?? 0) * 10 +
        (DIV_ORDER[b.division] ?? 0);
    return ai - bi;
  });

  return (
    <div className="overflow-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="bg-slate-800 text-white px-1 py-1 w-24 text-center font-medium">
              DH
            </th>
            <th className="bg-slate-800 text-white px-2 py-1 sticky left-0 z-10">
              Wk
            </th>
            {sortedTeams.map((t) => (
              <th
                key={t.team_id}
                className="bg-slate-800 text-white px-1 py-1 w-10 text-center font-medium"
              >
                {t.abbreviation}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => {
            const dhLabel = dhByWeek?.[String(week)] ?? "";
            return (
              <tr key={week} className="border-b border-slate-200">
                <td
                  className="text-center px-1 py-0.5 w-24 text-slate-600"
                  style={dhLabelStyle}
                >
                  {dhLabel}
                </td>
                <td className="bg-slate-100 font-bold text-slate-700 px-2 py-0.5 sticky left-0 text-center">
                  {week}
                </td>
                {sortedTeams.map((team) => {
                  const cell = lookup[team.abbreviation]?.[week];
                  if (!cell) {
                    return (
                      <ScheduleCell
                        key={team.team_id}
                        teamAbbr={null}
                        isHome={false}
                        slot={null}
                        tod={null}
                        policy={colorPolicy}
                      />
                    );
                  }
                  const key = pairKey(team.abbreviation, cell.opponent, week);
                  return (
                    <ScheduleCell
                      key={team.team_id}
                      teamAbbr={cell.opponent}
                      isHome={cell.isHome}
                      slot={cell.slot}
                      tod={cell.tod}
                      policy={colorPolicy}
                      isFixed={fixedPairKeys.has(key)}
                      onClick={
                        fixGamesMode ? () => onToggleFixed?.(key) : undefined
                      }
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ScheduleGrid;
