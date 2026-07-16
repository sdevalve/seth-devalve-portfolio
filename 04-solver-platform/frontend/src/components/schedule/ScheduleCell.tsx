import { getHomeColors, getAwayColors, BYE_COLORS } from "@/utils/colorPolicy";
import type ColorPolicy from "@/entities/ColorPolicy";

interface Props {
  teamAbbr: string | null; // null = bye week
  isHome: boolean;
  slot: string | null;
  tod: number | null;
  policy: ColorPolicy | null;
  isFixed?: boolean;
  onClick?: () => void;
}

const ScheduleCell = ({
  teamAbbr,
  isHome,
  slot,
  tod,
  policy,
  isFixed = false,
  onClick,
}: Props) => {
  if (teamAbbr === null) {
    return (
      <td
        style={{ backgroundColor: BYE_COLORS.bg }}
        className="px-1 py-0.5 w-10"
      />
    );
  }

  const colors = slot
    ? isHome
      ? getHomeColors(slot, tod, policy)
      : getAwayColors(slot, tod, policy)
    : { bg: "#f8fafc", text: "#1e293b" };

  return (
    <td
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        fontWeight: colors.fontWeight,
        fontStyle: colors.fontStyle,
        textDecoration: colors.textDecoration,
        outline: isFixed ? "2px solid #dc2626" : undefined,
        outlineOffset: isFixed ? "-2px" : undefined,
        cursor: onClick ? "pointer" : "default",
      }}
      className="text-center text-xs font-bold px-1 py-0.5 w-10 select-none"
      title={
        slot
          ? `${teamAbbr} · ${slot}${tod !== null ? ` (${tod})` : ""}`
          : teamAbbr
      }
      onClick={onClick}
    >
      {teamAbbr}
    </td>
  );
};

export default ScheduleCell;
