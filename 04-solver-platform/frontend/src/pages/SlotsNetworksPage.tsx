import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import useSeason from "@/hooks/useSeason";
import useSaveSlotsNetworks from "@/hooks/useSaveSlotsNetworks";
import useSeasonStore from "@/store/useSeasonStore";
import PrerequisiteGuard from "@/components/PrerequisiteGuard";

const DEFAULT_SLOTS = [
  "SNF",
  "MNF",
  "TNF",
  "Friday",
  "Saturday1",
  "Saturday2",
  "Thanksgiving1",
  "Thanksgiving2",
  "Christmas1",
  "Christmas2",
  "International",
];

const DEFAULT_NETWORKS = [
  "CBS",
  "FOX",
  "NBC",
  "ABC",
  "ESPN",
  "ESPN+ABC",
  "ESPN+ABC+E2",
  "ESPN PLUS",
  "PRIME VIDEO",
  "PEACOCK",
  "NFLNETWORK",
  "NFLNETWORK+OTA",
  "CBS+NICK",
  "NETFLIX",
  // "YOUTUBE",
];

// ── Sortable chip ────────────────────────────────────────────────────────────
const SortableChip = ({
  item,
  onRemove,
}: {
  item: string;
  onRemove: (val: string) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <span
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-1.5 rounded bg-white border border-slate-300 text-slate-800 text-sm"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-300 hover:text-slate-500 select-none flex-shrink-0"
        title="Drag to reorder"
      >
        ⠿
      </span>
      <span className="flex-1">{item}</span>
      <button
        type="button"
        onClick={() => onRemove(item)}
        className="text-slate-400 hover:text-red-500 leading-none flex-shrink-0"
      >
        ×
      </button>
    </span>
  );
};

// ── Slots panel (plain text input, no autocomplete) ──────────────────────────
interface ChipListPanelProps {
  title: string;
  description: string;
  items: string[];
  placeholder: string;
  onAdd: (val: string) => void;
  onRemove: (val: string) => void;
  onReorder: (items: string[]) => void;
  onLoadDefaults: () => void;
}

const ChipListPanel = ({
  title,
  description,
  items,
  placeholder,
  onAdd,
  onRemove,
  onReorder,
  onLoadDefaults,
}: ChipListPanelProps) => {
  const [input, setInput] = useState("");

  const sensors = useSensors(useSensor(PointerSensor));

  const handleAdd = () => {
    const val = input.trim().toUpperCase();
    if (!val || items.includes(val)) return;
    onAdd(val);
    setInput("");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      onReorder(arrayMove(items, oldIndex, newIndex));
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 flex flex-col gap-3">
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
          {title}
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700"
        >
          Add
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <SortableChip key={item} item={item} onRemove={onRemove} />
            ))}
            {items.length === 0 && (
              <p className="text-xs text-slate-400 italic">
                Nothing added yet.
              </p>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={onLoadDefaults}
        className="self-start text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
      >
        Load defaults
      </button>
    </div>
  );
};

// ── Networks: autocomplete input + validation modal ──────────────────────────
type ModalStep = "warning" | "form" | null;

const NetworkInput = ({
  items,
  onAdd,
}: {
  items: string[];
  onAdd: (name: string, analogue?: string) => void;
}) => {
  const [inputVal, setInputVal] = useState("");
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalStep>(null);
  const [pendingName, setPendingName] = useState("");
  const [analogue, setAnalogue] = useState("");

  const trimmed = inputVal.trim().toUpperCase();
  const filtered = trimmed
    ? DEFAULT_NETWORKS.filter((n) => n.startsWith(trimmed))
    : DEFAULT_NETWORKS;

  const handleAdd = () => {
    if (!trimmed || items.includes(trimmed)) return;
    if (DEFAULT_NETWORKS.includes(trimmed)) {
      onAdd(trimmed);
      setInputVal("");
    } else {
      setPendingName(trimmed);
      setModal("warning");
    }
  };

  const resetModal = () => {
    setModal(null);
    setPendingName("");
    setAnalogue("");
  };

  const handleConfirmNew = () => {
    if (!pendingName || !analogue) return;
    onAdd(pendingName, analogue);
    setInputVal("");
    resetModal();
  };

  return (
    <>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="e.g. NBC"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
          {open && filtered.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded shadow-lg max-h-52 overflow-y-auto">
              {filtered.map((n) => (
                <li
                  key={n}
                  onMouseDown={() => {
                    setInputVal(n);
                    setOpen(false);
                  }}
                  className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700"
        >
          Add
        </button>
      </div>

      {/* ── Modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            {modal === "warning" ? (
              <>
                <h3 className="text-base font-semibold text-slate-900 mb-3">
                  Unknown Network
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">
                  The network you are trying to add is not a member of one of
                  the historical NFL network partners. If trying to add a
                  first-year network partner, click <strong>Continue</strong>.
                  If you are attempting to add a historically utilized network,
                  click <strong>Cancel</strong> and pick a network from the
                  dropdown menu.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={resetModal}
                    className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setModal("form")}
                    className="px-4 py-2 text-sm rounded bg-slate-800 text-white hover:bg-slate-700"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-slate-900 mb-4">
                  Add New Network Partner
                </h3>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Please enter the name of the new network:
                    </label>
                    <input
                      value={pendingName}
                      onChange={(e) =>
                        setPendingName(e.target.value.toUpperCase())
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      Please select a network that best approximates the new
                      network based on platform style, audience, and expected
                      viewership:
                    </label>
                    <select
                      value={analogue}
                      onChange={(e) => setAnalogue(e.target.value)}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                    >
                      <option value="">select analogue</option>
                      {DEFAULT_NETWORKS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button
                    onClick={resetModal}
                    className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmNew}
                    disabled={!pendingName || !analogue}
                    className="px-4 py-2 text-sm rounded bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirm
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// ── Networks panel ────────────────────────────────────────────────────────────
interface NetworksPanelProps {
  items: string[];
  onAdd: (name: string, analogue?: string) => void;
  onRemove: (val: string) => void;
  onReorder: (items: string[]) => void;
  onLoadDefaults: () => void;
}

const NetworksPanel = ({
  items,
  onAdd,
  onRemove,
  onReorder,
  onLoadDefaults,
}: NetworksPanelProps) => {
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      onReorder(arrayMove(items, oldIndex, newIndex));
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 flex flex-col gap-3">
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
          Broadcast Networks
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          TV networks that carry games (e.g. NBC, ESPN). These become the valid
          entries in the Weekmap.
        </p>
      </div>

      <NetworkInput items={items} onAdd={onAdd} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <SortableChip key={item} item={item} onRemove={onRemove} />
            ))}
            {items.length === 0 && (
              <p className="text-xs text-slate-400 italic">
                Nothing added yet.
              </p>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={onLoadDefaults}
        className="self-start text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
      >
        Load defaults
      </button>
    </div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
const SlotsNetworksPage = () => {
  const { selectedSeason } = useSeasonStore();
  const { data: season } = useSeason(selectedSeason);
  const saveMutation = useSaveSlotsNetworks(season?.season_id ?? null);

  const [slots, setSlots] = useState<string[]>([]);
  const [networks, setNetworks] = useState<string[]>([]);
  const [newNetworkDict, setNewNetworkDict] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    if (season) {
      setSlots(season.slots.length > 0 ? season.slots : DEFAULT_SLOTS);
      setNetworks(
        season.networks.length > 0 ? season.networks : DEFAULT_NETWORKS,
      );
      setNewNetworkDict(season.new_network_dict ?? {});
    }
  }, [season]);

  const handleAddNetwork = (name: string, analogue?: string) => {
    if (networks.includes(name)) return;
    if (analogue) {
      setNewNetworkDict((prev) => ({ ...prev, [name]: analogue }));
    }
    setNetworks((prev) => [...prev, name]);
  };

  const handleRemoveNetwork = (val: string) => {
    setNetworks((prev) => prev.filter((n) => n !== val));
    setNewNetworkDict((prev) => {
      const { [val]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleSave = () => {
    saveMutation.mutate({ slots, networks, new_network_dict: newNetworkDict });
  };

  return (
    <PrerequisiteGuard
      met={!!selectedSeason}
      message="Select a season from the top bar first."
    >
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-slate-900">
            Slots & Networks · {selectedSeason}
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-4 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
            {saveMutation.isSuccess && (
              <span className="text-green-600 text-sm">Saved ✓</span>
            )}
            {saveMutation.isError && (
              <span className="text-red-500 text-sm">
                Error. Check console.
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <ChipListPanel
            title="Broadcast Slots"
            description="Named time slots used in the schedule (e.g. SNF, MNF). These become the columns in the Weekmap."
            items={slots}
            placeholder="e.g. SNF"
            onAdd={(val) => setSlots((prev) => [...prev, val])}
            onRemove={(val) =>
              setSlots((prev) => prev.filter((s) => s !== val))
            }
            onReorder={setSlots}
            onLoadDefaults={() => setSlots(DEFAULT_SLOTS)}
          />

          <NetworksPanel
            items={networks}
            onAdd={handleAddNetwork}
            onRemove={handleRemoveNetwork}
            onReorder={setNetworks}
            onLoadDefaults={() => {
              setNetworks(DEFAULT_NETWORKS);
              setNewNetworkDict({});
            }}
          />
        </div>
      </div>
    </PrerequisiteGuard>
  );
};

export default SlotsNetworksPage;
