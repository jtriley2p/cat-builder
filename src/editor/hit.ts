/**
 * Geometric hit-testing against a layout, in diagram (world) coordinates.
 * Pure, so the editor's pointer logic can be reasoned about (and tested)
 * independently of the DOM.
 */
import type { Layout } from "../geometry/layout";
import { distToSegment, inBox, type Vec } from "../geometry/vec";
import type { CellId } from "../model/types";

export interface Hit {
  readonly kind: "vertex" | "edge";
  readonly id: CellId;
}

/** Minimum half-size of a vertex's clickable area, so tiny labels (•) and unlabelled points stay easy to grab. */
const MIN_VERTEX_HALF = 12;

/**
 * The cell under `p`, or null. Vertices win over edges (they are the usual
 * drag targets); among edges the nearest one within `tolerance` wins, with a
 * click on an edge's label counting as distance zero.
 */
export const hitTest = (layout: Layout, p: Vec, tolerance: number, exclude?: CellId): Hit | null => {
  for (let i = layout.cells.length - 1; i >= 0; i--) {
    const c = layout.cells[i]!;
    if (c.kind !== "vertex" || c.id === exclude) continue;
    const hw = Math.max(c.label?.box.hw ?? 0, MIN_VERTEX_HALF);
    const hh = Math.max(c.label?.box.hh ?? 0, MIN_VERTEX_HALF);
    const cy = c.label?.box.cy ?? c.center.y;
    if (inBox({ cx: c.center.x, cy, hw, hh }, p)) return { kind: "vertex", id: c.id };
  }

  let best: Hit | null = null;
  let bestDist = tolerance;
  for (const c of layout.cells) {
    if (c.kind !== "edge" || c.id === exclude) continue;
    const d = c.label && inBox(c.label.box, p, 2) ? 0 : polylineDistance(c.hitPath, p);
    if (d <= bestDist) {
      best = { kind: "edge", id: c.id };
      bestDist = d;
    }
  }
  return best;
};

const polylineDistance = (pts: readonly Vec[], p: Vec): number => {
  if (pts.length === 1) return Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1]!, pts[i]!));
  return best;
};

/** Cells whose reference point (vertex centre, edge midpoint) lies inside the rectangle spanned by `a` and `b`. */
export const cellsInRect = (layout: Layout, a: Vec, b: Vec): CellId[] => {
  const box = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, hw: Math.abs(a.x - b.x) / 2, hh: Math.abs(a.y - b.y) / 2 };
  return layout.cells.filter(c => inBox(box, c.kind === "vertex" ? c.center : c.anchor)).map(c => c.id);
};
