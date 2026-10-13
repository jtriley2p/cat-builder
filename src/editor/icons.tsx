/**
 * Small inline SVG icons for the inspector and toolbar, drawn in
 * `currentColor` (so they follow button states). Styles: `.icon` and
 * `.tool-icon` in index.css.
 */
import type { ReactNode } from "react";
import type { Vec } from "../geometry/vec";
import type { LabelSide } from "../model/types";

/** The four line orientations icons can show. Screen coordinates: y grows downward. */
export type LineOrientation = "horizontal" | "vertical" | "down-right" | "down-left";

/** Snap a direction to the nearest orientation (lines are undirected, so angles are taken mod 180°). */
export const orientationOf = (d: Vec): LineOrientation => {
  const deg = (((Math.atan2(d.y, d.x) * 180) / Math.PI) % 180 + 180) % 180;
  if (deg < 22.5 || deg >= 157.5) return "horizontal";
  if (deg < 67.5) return "down-right"; // "\"
  if (deg < 112.5) return "vertical";
  return "down-left"; // "/"
};

const SIZE = 20;
const MID = SIZE / 2;
const D = Math.SQRT1_2;

/** Each orientation's line (in a 20×20 box) and a unit normal used to put the box on one side of it. */
const LINES: Record<LineOrientation, { readonly a: Vec; readonly b: Vec; readonly normal: Vec; readonly diagonal: boolean }> = {
  horizontal: { a: { x: 3, y: MID }, b: { x: 17, y: MID }, normal: { x: 0, y: -1 }, diagonal: false },
  vertical: { a: { x: MID, y: 3 }, b: { x: MID, y: 17 }, normal: { x: -1, y: 0 }, diagonal: false },
  "down-right": { a: { x: 4.5, y: 4.5 }, b: { x: 15.5, y: 15.5 }, normal: { x: D, y: -D }, diagonal: true },
  "down-left": { a: { x: 15.5, y: 4.5 }, b: { x: 4.5, y: 15.5 }, normal: { x: -D, y: -D }, diagonal: true },
};

const BOX = 6;

/**
 * Where a label goes: a line in the selected arrow's orientation and a small
 * box for the label — beside the line for left/right, on it for centre (the
 * line broken around it) and over (the line drawn through it).
 *
 * `along` and `left` are the arrow's direction and the way its "left" side
 * actually faces (from its layout), so the icon previews the real placement
 * whichever way the arrow points.
 */
export const LabelSideIcon = ({ side, along, left }: { side: LabelSide; along: Vec; left: Vec }) => {
  const { a, b, normal, diagonal } = LINES[orientationOf(along)];
  // Which of the line's two normals is this arrow's "left".
  const leftward = normal.x * left.x + normal.y * left.y >= 0 ? 1 : -1;
  const k = side === "left" ? leftward : side === "right" ? -leftward : 0;
  // The box's half-extent across (and along) a diagonal line is larger, so keep it a little further out.
  const reach = diagonal ? (BOX / 2) * Math.SQRT2 : BOX / 2;
  const cx = MID + normal.x * k * (reach + 2.5);
  const cy = MID + normal.y * k * (reach + 2.5);

  const box = <rect className="icon-box" x={cx - BOX / 2} y={cy - BOX / 2} width={BOX} height={BOX} rx={1} />;
  let line;
  if (side === "centre") {
    // Two pieces stopping short of the box.
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const gap = reach + 1.5;
    line = <path d={`M${a.x} ${a.y}L${MID - u.x * gap} ${MID - u.y * gap}M${MID + u.x * gap} ${MID + u.y * gap}L${b.x} ${b.y}`} />;
  } else {
    line = <path d={`M${a.x} ${a.y}L${b.x} ${b.y}`} />;
  }

  return (
    <svg className="icon" viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
      {/* "over" draws the line on top of the box; otherwise the box goes last. */}
      {side === "over" ? (
        <>
          {box}
          {line}
        </>
      ) : (
        <>
          {line}
          {box}
        </>
      )}
    </svg>
  );
};

/**
 * An arrow pointing at `angle` degrees, measured like a loop's direction:
 * 0 = right, 90 = down (SVG rotation is clockwise on screen, as is ours).
 */
export const DirectionIcon = ({ angle }: { angle: number }) => (
  <svg className="icon" viewBox="-10 -10 20 20" width={16} height={16} aria-hidden="true">
    <path transform={`rotate(${angle})`} d="M-6 0H6M2 -4L6 0L2 4" />
  </svg>
);

// ---------------------------------------------------------------------------
// Toolbar icons (24×24, stroked; see `.tool-icon`)
// ---------------------------------------------------------------------------

const ToolIcon = ({ children }: { children: ReactNode }) => (
  <svg className="icon tool-icon" viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
    {children}
  </svg>
);

/** A hooked arrow turning back to the left. */
export const UndoIcon = () => (
  <ToolIcon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </ToolIcon>
);

/** A hooked arrow turning forward to the right. */
export const RedoIcon = () => (
  <ToolIcon>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </ToolIcon>
);

/** A 3×3 grid: layout (grid spacing, zoom). */
export const GridIcon = () => (
  <ToolIcon>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <path d="M9.17 3.5v17M14.83 3.5v17M3.5 9.17h17M3.5 14.83h17" />
  </ToolIcon>
);

/** An arrow rising out of a tray: export. */
export const ExportIcon = () => (
  <ToolIcon>
    <path d="M12 15V3.5" />
    <path d="m7 8.5 5-5 5 5" />
    <path d="M4.5 14.5v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
  </ToolIcon>
);

/** A trash can: clear the diagram. */
export const TrashIcon = () => (
  <ToolIcon>
    <path d="M4 6.5h16" />
    <path d="M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 6.5l1 13a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5l1-13" />
    <path d="M10 11v6M14 11v6" />
  </ToolIcon>
);

/** A circled "i": help. */
export const InfoIcon = () => (
  <ToolIcon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <path d="M12 7.6v.01" strokeWidth={2.6} />
  </ToolIcon>
);
