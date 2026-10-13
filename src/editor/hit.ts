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
 * The cell under `p`, or null. In order of precedence:
 *
 * 1. a vertex's label (the usual drag target);
 * 2. the nearest edge within `tolerance` (a click on an edge's label counts
 *    as distance zero), so arrows stay selectable where they pass close to
 *    a vertex;
 * 3. the rest of a vertex's grid square: each object owns its whole cell,
 *    which keeps small labels (•) and unlabelled points easy to grab.
 */
export const hitTest = (layout: Layout, p: Vec, tolerance: number): Hit | null => {
  const vertices = layout.cells.filter(c => c.kind === "vertex");
  for (const v of vertices) {
    const hw = Math.max(v.label?.box.hw ?? 0, MIN_VERTEX_HALF);
    const hh = Math.max(v.label?.box.hh ?? 0, MIN_VERTEX_HALF);
    const cy = v.label?.box.cy ?? v.center.y;
    if (inBox({ cx: v.center.x, cy, hw, hh }, p)) return { kind: "vertex", id: v.id };
  }

  let best: Hit | null = null;
  let bestDist = tolerance;
  for (const c of layout.cells) {
    if (c.kind !== "edge") continue;
    const d = c.label && inBox(c.label.box, p, 2) ? 0 : polylineDistance(c.hitPath, p);
    if (d <= bestDist) {
      best = { kind: "edge", id: c.id };
      bestDist = d;
    }
  }
  if (best) return best;

  const half = layout.cellSize / 2;
  const owner = vertices.find(v => inBox({ cx: v.center.x, cy: v.center.y, hw: half, hh: half }, p));
  return owner ? { kind: "vertex", id: owner.id } : null;
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
