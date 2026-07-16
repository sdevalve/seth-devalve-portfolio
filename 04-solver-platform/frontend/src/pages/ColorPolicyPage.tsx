import { useState, useEffect, useRef } from "react";
import useSeasonStore from "@/store/useSeasonStore";
import useSeason from "@/hooks/useSeason";
import useColorPolicy from "@/hooks/useColorPolicy";
import useSaveColorPolicy from "@/hooks/useSaveColorPolicy";
import PrerequisiteGuard from "@/components/PrerequisiteGuard";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_PALETTE = [
  "#0F7004",
  "#E7D40B",
  "#930393",
  "#9900ff",
  "#FF46F5",
  "#cacace",
  "#000000",
  "#8a8a8f",
  "#edd182",
  "#FFFFFF",
  "#ff6666",
  "#CC0000",
  "#00ace6",
  "#1a1aff",
];

/** CBS/FOX broadcast window slots — always present regardless of season slot config. */
const CBS_FOX_SLOTS = [
  "CBS (early)",
  "CBS (late)",
  "FOX (early)",
  "FOX (late)",
] as const;

const TOD_LABELS = [
  "morning",
  "afternoon",
  "mid-afternoon",
  "evening",
] as const;
const FORMAT_OPTIONS = ["bold", "italic", "underline"] as const;
type FormatOption = (typeof FORMAT_OPTIONS)[number] | null;

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip trailing digits to collapse MNF1/MNF2 → MNF, Saturday1/2 → Saturday, etc. */
const collapseSlots = (slots: string[]): string[] => {
  const seen = new Set<string>();
  return slots
    .map((s) => s.replace(/\d+$/, ""))
    .filter((s) => !seen.has(s) && seen.add(s));
};

/** Small colored square preview — mirrors the VS Code hex color chip. */
const ColorChip = ({ hex }: { hex: string }) => (
  <span
    className="inline-block w-4 h-4 rounded-sm border border-slate-300 flex-shrink-0"
    style={{ backgroundColor: HEX_REGEX.test(hex) ? hex : "transparent" }}
  />
);

const selectCls =
  "px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white";

// ── ColorSelect — custom dropdown that renders a color chip next to each option ──

interface ColorSelectProps {
  value: string | null;
  palette: string[];
  onChange: (value: string | null) => void;
}

const ColorSelect = ({ value, palette, onChange }: ColorSelectProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (hex: string | null) => {
    onChange(hex);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex-1">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm border border-slate-300 rounded bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 text-left"
      >
        {value ? (
          <>
            <ColorChip hex={value} />
            <span className="font-mono text-slate-700 flex-1">{value}</span>
          </>
        ) : (
          <span className="text-slate-400 flex-1">None</span>
        )}
        <span className="text-slate-400 text-xs">▾</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded shadow-lg max-h-52 overflow-y-auto">
          <button
            type="button"
            onClick={() => select(null)}
            className={`w-full flex items-center px-3 py-1.5 text-sm hover:bg-slate-50 ${value === null ? "bg-sky-50" : ""}`}
          >
            <span className="text-slate-400">None</span>
          </button>
          {palette.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => select(hex)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 ${value === hex ? "bg-sky-50" : ""}`}
            >
              <ColorChip hex={hex} />
              <span className="font-mono text-slate-700">{hex}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const ColorPolicyPage = () => {
  const { selectedSeason } = useSeasonStore();
  const { data: season } = useSeason(selectedSeason);
  const { data: policy } = useColorPolicy(selectedSeason);
  const save = useSaveColorPolicy(selectedSeason);

  // ── Local state ───────────────────────────────────────────────────────────
  const [palette, setPalette] = useState<string[]>([]);
  const [slotColors, setSlotColors] = useState<Record<string, string | null>>(
    {},
  );
  const [todFormats, setTodFormats] = useState<Record<string, FormatOption>>({
    morning: null,
    afternoon: null,
    "mid-afternoon": null,
    evening: null,
  });
  const [dhFormat, setDhFormat] = useState<FormatOption>(null);
  const [newHex, setNewHex] = useState("");
  const [hexError, setHexError] = useState("");
  /** In-progress edits keyed by original hex — committed on blur/Enter. */
  const [paletteEdits, setPaletteEdits] = useState<Record<string, string>>({});

  // Populate form from saved policy once loaded
  useEffect(() => {
    if (!policy) return;
    setPalette(policy.palette.length > 0 ? policy.palette : []);
    setSlotColors(policy.slot_colors ?? {});
    setTodFormats({
      morning: (policy.tod_formats?.morning as FormatOption) ?? null,
      afternoon: (policy.tod_formats?.afternoon as FormatOption) ?? null,
      "mid-afternoon":
        (policy.tod_formats?.["mid-afternoon"] as FormatOption) ?? null,
      evening: (policy.tod_formats?.evening as FormatOption) ?? null,
    });
    setDhFormat((policy.dh_format as FormatOption) ?? null);
  }, [policy]);

  // ── Collapsed slots from season (CBS/FOX excluded — covered by Broadcast Windows) ──
  const collapsedSlots = season
    ? collapseSlots(season.slots).filter(
        (s) => !s.startsWith("CBS") && !s.startsWith("FOX"),
      )
    : [];

  // ── Format uniqueness validation ──────────────────────────────────────────
  const usedFormats = [
    todFormats.morning,
    todFormats.afternoon,
    todFormats["mid-afternoon"],
    todFormats.evening,
    dhFormat,
  ].filter((f): f is NonNullable<FormatOption> => f !== null && f !== undefined);

  const hasDuplicateFormats = new Set(usedFormats).size !== usedFormats.length;
  const duplicateNames = FORMAT_OPTIONS.filter(
    (f) => usedFormats.filter((u) => u === f).length > 1,
  );

  // ── Palette actions ───────────────────────────────────────────────────────
  const loadDefaults = () => {
    const merged = [...new Set([...palette, ...DEFAULT_PALETTE])];
    setPalette(merged);
  };

  const addHex = () => {
    const trimmed = newHex.trim().toUpperCase();
    const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (!HEX_REGEX.test(normalized)) {
      setHexError("Enter a valid 6-digit hex code, e.g. #FF4500");
      return;
    }
    if (palette.includes(normalized)) {
      setHexError("This color is already in the palette.");
      return;
    }
    setPalette((p) => [...p, normalized]);
    setNewHex("");
    setHexError("");
  };

  const removeHex = (hex: string) => {
    setPalette((p) => p.filter((h) => h !== hex));
    setPaletteEdits((d) => {
      const next = { ...d };
      delete next[hex];
      return next;
    });
    setSlotColors((sc) => {
      const updated = { ...sc };
      for (const slot of Object.keys(updated)) {
        if (updated[slot] === hex) updated[slot] = null;
      }
      return updated;
    });
  };

  const handlePaletteEditChange = (origHex: string, value: string) => {
    setPaletteEdits((d) => ({ ...d, [origHex]: value }));
  };

  const commitPaletteEdit = (origHex: string) => {
    const raw = (paletteEdits[origHex] ?? origHex).trim().toUpperCase();
    const normalized = raw.startsWith("#") ? raw : `#${raw}`;
    // Always clear the draft first
    setPaletteEdits((d) => {
      const next = { ...d };
      delete next[origHex];
      return next;
    });
    if (!HEX_REGEX.test(normalized) || normalized === origHex) return;
    if (palette.filter((h) => h !== origHex).includes(normalized)) return; // duplicate
    // Replace in palette and fix any slot colors pointing at the old hex
    setPalette((p) => p.map((h) => (h === origHex ? normalized : h)));
    setSlotColors((sc) => {
      const updated = { ...sc };
      for (const slot of Object.keys(updated)) {
        if (updated[slot] === origHex) updated[slot] = normalized;
      }
      return updated;
    });
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = () => {
    save.mutate({
      palette,
      slot_colors: slotColors,
      tod_formats: todFormats,
      dh_format: dhFormat,
    });
  };

  // ── Prerequisite guard ────────────────────────────────────────────────────
  const hasSlots = !!(season && season.slots.length > 0);

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Color Policy</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Define colors and typography for schedule rendering. Configure once
          per season and reference during solution visualization.
        </p>
      </div>

      <PrerequisiteGuard
        met={hasSlots}
        message="Save slots on the Slots & Networks page first before configuring the color policy."
      >
        {/* ── Build Color Palette ──────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800">
              Build Color Palette
            </h2>
            <button
              type="button"
              onClick={loadDefaults}
              className="text-xs text-sky-600 hover:text-sky-800 underline"
            >
              Load defaults
            </button>
          </div>

          {palette.length === 0 && (
            <p className="text-xs text-slate-400 italic">
              No colors yet. Click "Load defaults" or add a hex code below.
            </p>
          )}

          <div className="flex flex-col gap-1">
            {palette.map((hex) => {
              const draft = paletteEdits[hex] ?? hex;
              const draftNorm = draft.trim().toUpperCase();
              const previewHex = draftNorm.startsWith("#")
                ? draftNorm
                : `#${draftNorm}`;
              return (
                <div key={hex} className="flex items-center gap-2">
                  <ColorChip hex={previewHex} />
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) =>
                      handlePaletteEditChange(hex, e.target.value)
                    }
                    onBlur={() => commitPaletteEdit(hex)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="flex-1 text-xs font-mono px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => removeHex(hex)}
                    className="text-xs text-slate-400 hover:text-red-500 flex-shrink-0"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add new hex */}
          <div className="flex items-start gap-2 pt-1 border-t border-slate-100">
            <div className="flex flex-col gap-1 flex-1">
              <div className="flex items-center gap-2">
                <ColorChip hex={newHex} />
                <input
                  type="text"
                  value={newHex}
                  onChange={(e) => {
                    setNewHex(e.target.value);
                    setHexError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && addHex()}
                  placeholder="#RRGGBB"
                  className="flex-1 px-2 py-1 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <button
                  type="button"
                  onClick={addHex}
                  className="px-3 py-1 text-xs bg-slate-800 text-white rounded hover:bg-slate-600"
                >
                  Add
                </button>
              </div>
              {hexError && <p className="text-xs text-red-500">{hexError}</p>}
            </div>
          </div>
        </section>

        {/* ── Slot Colors ──────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-slate-800">
            Slot Colors
          </h2>
          <p className="text-xs text-slate-400">
            Assign a palette color to each slot. Integer-suffixed slots are
            collapsed (e.g. MNF1 and MNF2 share the MNF color). CBS and FOX
            broadcast windows are always included.
          </p>

          {collapsedSlots.length === 0 && (
            <p className="text-xs text-slate-400 italic">
              No season slots loaded.
            </p>
          )}

          {/* Season-derived slots */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Prime Time
            </p>
            {collapsedSlots.map((slot) => (
              <div key={slot} className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700 w-36 flex-shrink-0">
                  {slot}
                </span>
                <ColorSelect
                  value={slotColors[slot] ?? null}
                  palette={palette}
                  onChange={(hex) =>
                    setSlotColors((sc) => ({ ...sc, [slot]: hex }))
                  }
                />
              </div>
            ))}
          </div>

          {/* CBS / FOX broadcast windows — always present */}
          <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Sunday Afternoon
            </p>
            {CBS_FOX_SLOTS.map((slot) => (
              <div key={slot} className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700 w-36 flex-shrink-0">
                  {slot}
                </span>
                <ColorSelect
                  value={slotColors[slot] ?? null}
                  palette={palette}
                  onChange={(hex) =>
                    setSlotColors((sc) => ({ ...sc, [slot]: hex }))
                  }
                />
              </div>
            ))}
          </div>
        </section>

        {/* ── Time of Day Formats ──────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-slate-800">
            Time of Day Formats
          </h2>
          <p className="text-xs text-slate-400">
            Choose a font style for each time of day. Each style can only be
            used once across all five dropdowns (including Double Header). At
            least two must be None.
          </p>

          <div className="flex flex-col gap-3">
            {TOD_LABELS.map((tod) => (
              <div key={tod} className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700 w-36 flex-shrink-0 capitalize">
                  {tod}
                </span>
                <select
                  className={`${selectCls} flex-1`}
                  value={todFormats[tod] ?? ""}
                  onChange={(e) =>
                    setTodFormats((f) => ({
                      ...f,
                      [tod]: (e.target.value as FormatOption) || null,
                    }))
                  }
                >
                  <option value="">None</option>
                  {FORMAT_OPTIONS.map((fmt) => (
                    <option key={fmt} value={fmt}>
                      {fmt.charAt(0).toUpperCase() + fmt.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {hasDuplicateFormats && (
            <p className="text-xs text-red-500 font-medium">
              "{duplicateNames.join(", ")}" is used more than once. Each format
              can only be assigned once across Time of Day and Double Header.
            </p>
          )}
        </section>

        {/* ── Double Header Formatting ─────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Double Header Formatting
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Choose if and how you want double header matchups to be indicated
              in schedule rendering. Subject to the same uniqueness constraint
              as Time of Day.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700 w-36 flex-shrink-0">
              Double Header
            </span>
            <select
              className={`${selectCls} flex-1`}
              value={dhFormat ?? ""}
              onChange={(e) =>
                setDhFormat((e.target.value as FormatOption) || null)
              }
            >
              <option value="">None</option>
              {FORMAT_OPTIONS.map((fmt) => (
                <option key={fmt} value={fmt}>
                  {fmt.charAt(0).toUpperCase() + fmt.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* ── Save ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 pb-8">
          <button
            type="button"
            onClick={handleSave}
            disabled={save.isPending || hasDuplicateFormats}
            className="px-5 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save Color Policy"}
          </button>
          {save.isSuccess && (
            <span className="text-sm text-emerald-600 font-medium">Saved</span>
          )}
          {save.isError && (
            <span className="text-sm text-red-500 font-medium">
              Save failed
            </span>
          )}
          {policy?.updated_at && (
            <span className="text-xs text-slate-400 ml-auto">
              Last saved {new Date(policy.updated_at).toLocaleString()}
            </span>
          )}
        </div>
      </PrerequisiteGuard>
    </div>
  );
};

export default ColorPolicyPage;
