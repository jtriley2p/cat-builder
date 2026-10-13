/**
 * Layout: turns a `Diagram` into concrete geometry — label boxes, clipped
 * arrow curves and the stroke paths that draw them.
 *
 * Both the editor and the exporters render from the same layout, so what you
 * see is exactly what gets exported. The layout is a pure function of the
 * diagram, the style and the typesetter (injected so tests can stub it).
 *
 * Cells are laid out in diagram order; the topological-order invariant means
 * an edge's endpoints are always laid out before the edge itself.
 */
import type { CellId, Diagram, Edge, EdgeOptions, Vertex } from "../model/types";
import type { TexBox, TexSize } from "../render/tex";
import {
  arcTable,
  cubicPath,
  exitParam,
  fmtPt,
  fromQuadratic,
  inShape,
  insideRange,
  midpoint,
  offset as offsetCurve,
  point,
  polylinePath,
  sample,
  segment,
  tAtLength,
  tangent,
  type Cubic,
  type Shape,
} from "./bezier";
import type { Style } from "./style";
import {
  addScaled,
  boxBounds,
  dist,
  fromAngle,
  inBox,
  leftNormal,
  lerp,
  pointsBounds,
  rotate,
  scale,
  sub,
  unionBounds,
  normalize,
  type Bounds,
  type Box,
  type Vec,
} from "./vec";

export type Typeset = (tex: string, size: TexSize) => TexBox | null;

/** A typeset label placed in the diagram. `box` is its full extent in px. */
export interface LabelLayout {
  readonly tex: TexBox;
  readonly box: Box;
}

export interface VertexLayout {
  readonly kind: "vertex";
  readonly id: CellId;
  readonly center: Vec;
  readonly label: LabelLayout | null;
  /** Region arrows are clipped against. */
  readonly shape: Shape;
  readonly bounds: Bounds;
}

/** One stroked path. Fill is always none; heads and tails are always solid. */
export interface Stroke {
  readonly d: string;
  readonly dash: "solid" | "dashed" | "dotted";
}

export interface EdgeLayout {
  readonly kind: "edge";
  readonly id: CellId;
  /** The edge's centre line, clipped at its endpoints; null when the endpoints overlap. */
  readonly curve: Cubic | null;
  /** Point other arrows attach to (the middle of this one). */
  readonly anchor: Vec;
  readonly strokes: readonly Stroke[];
  readonly label: LabelLayout | null;
  /** Polyline approximating what is drawn, for hit-testing and selection highlights. */
  readonly hitPath: readonly Vec[];
  readonly bounds: Bounds;
  /**
   * The edge's overall direction and which way its "left" side faces (unit
   * vectors, screen coordinates), e.g. for UI that previews label sides.
   * For a loop, the direction of travel at its far end. Null when the
   * endpoints overlap.
   */
  readonly frame: { readonly along: Vec; readonly left: Vec } | null;
}

export type CellLayout = VertexLayout | EdgeLayout;

export interface Layout {
  /** In diagram (paint) order. */
  readonly cells: readonly CellLayout[];
  readonly byId: ReadonlyMap<CellId, CellLayout>;
  /** Extent of everything drawn; empty bounds for an empty diagram. */
  readonly bounds: Bounds;
  /** Grid spacing the layout was made with: each vertex owns the cellSize × cellSize square around its centre. */
  readonly cellSize: number;
}

// ---------------------------------------------------------------------------
// Vertices
// ---------------------------------------------------------------------------

export const vertexCenter = (v: Pick<Vertex, "col" | "row">, cellSize: number): Vec => ({
  x: v.col * cellSize,
  y: v.row * cellSize,
});

const layoutVertex = (v: Vertex, cellSize: number, style: Style, typeset: Typeset): VertexLayout => {
  const center = vertexCenter(v, cellSize);
  const tex = typeset(v.label, "normal");
  if (!tex) {
    const shape: Shape = { kind: "circle", c: center, r: style.pointRadius };
    return { kind: "vertex", id: v.id, center, label: null, shape, bounds: pointsBounds([center], style.pointRadius) };
  }
  // Centre the label on the math axis (like a TeX \vcenter) rather than on its
  // bounding box, so that objects in one row share a baseline.
  const em = style.em;
  const baseline = center.y + style.axisHeight * em;
  const top = baseline - tex.ascent * em;
  const bottom = baseline + tex.descent * em;
  const box: Box = { cx: center.x, cy: (top + bottom) / 2, hw: (tex.width * em) / 2, hh: (bottom - top) / 2 };
  const shape: Shape = { kind: "box", cx: box.cx, cy: box.cy, hw: box.hw + style.vertexPad, hh: box.hh + style.vertexPad };
  return { kind: "vertex", id: v.id, center, label: { tex, box }, shape, bounds: boxBounds(box) };
};

// ---------------------------------------------------------------------------
// Edge geometry
// ---------------------------------------------------------------------------

interface Endpoint {
  readonly p: Vec;
  readonly shape: Shape;
}

const endpointOf = (c: CellLayout, style: Style): Endpoint =>
  c.kind === "vertex"
    ? { p: c.center, shape: c.shape }
    : { p: c.anchor, shape: { kind: "circle", c: c.anchor, r: style.anchorRadius } };

/** Clip `full` so it starts where it leaves `src` and ends where it enters `tgt`. */
const clip = (full: Cubic, src: Shape, tgt: Shape): Cubic | null => {
  const t0 = exitParam(full, p => inShape(src, p), true);
  const t1 = exitParam(full, p => inShape(tgt, p), false);
  if (t0 === null || t1 === null || t1 - t0 < 1e-3) return null;
  return segment(full, t0, t1);
};

/** The unclipped centre curve of a loop on a vertex at `c`. */
const loopCurve = (c: Vec, o: EdgeOptions, cellSize: number, style: Style): Cubic => {
  const theta = (o.loopAngle * Math.PI) / 180;
  const reach = style.loopReach * cellSize * Math.max(0.4, 1 + 0.2 * o.curve);
  return [
    c,
    addScaled(c, fromAngle(theta - style.loopSpread), reach),
    addScaled(c, fromAngle(theta + style.loopSpread), reach),
    c,
  ];
};

/**
 * Which way an edge's sides face. Label side, curve and offset are read in
 * a *screen* frame rather than relative to the direction of travel: an
 * arrow is treated as if it pointed up (when mostly vertical or exactly
 * diagonal) or right (when mostly horizontal). So "left" is the screen's
 * left of a vertical or diagonal arrow (lower-left of "\", upper-left of
 * "/") and above a horizontal one; positive curve and offset go toward the
 * "right"; and reversing an arrow never moves its label or bend.
 *
 * Returns +1 when the chord `d` already points that way (the frame matches
 * the direction of travel) and -1 when it points the opposite way.
 */
export const frameSign = (d: Vec): 1 | -1 =>
  Math.abs(d.y) >= Math.abs(d.x) ? (d.y < 0 ? 1 : -1) : d.x >= 0 ? 1 : -1;

/**
 * The unclipped centre curve between two distinct points, bent and shifted
 * per the options. `side` is the edge's frame sign (see `frameSign`).
 */
const edgeCurve = (a: Vec, b: Vec, o: EdgeOptions, side: 1 | -1, style: Style): Cubic => {
  // Unit normal toward the frame's right: where positive offset and curve go.
  const right = scale(leftNormal(sub(b, a)), -side);
  const a2 = addScaled(a, right, o.offset * style.offsetUnit);
  const b2 = addScaled(b, right, o.offset * style.offsetUnit);
  // A quadratic whose end tangents make angle α with the chord; elevated to a cubic.
  const alpha = o.curve * style.curveStep;
  const q = addScaled(lerp(a2, b2, 0.5), right, (dist(a, b) / 2) * Math.tan(alpha));
  return fromQuadratic(a2, q, b2);
};

// ---------------------------------------------------------------------------
// Decorations (all in terms of a tip/base point and unit direction)
// ---------------------------------------------------------------------------

/**
 * An open, slightly curved arrowhead (in the style of Computer Modern's
 * arrow tips) with its tip at `tip`, pointing along `u`.
 */
const chevron = (tip: Vec, u: Vec, length: number, half: number): string => {
  const n = leftNormal(u);
  const back = addScaled(tip, u, -length);
  const ctrl = addScaled(tip, u, -0.5 * length);
  const b1 = addScaled(back, n, half);
  const b2 = addScaled(back, n, -half);
  const c1 = addScaled(ctrl, n, 0.25 * half);
  const c2 = addScaled(ctrl, n, -0.25 * half);
  return `M${fmtPt(b1)}Q${fmtPt(c1)} ${fmtPt(tip)}Q${fmtPt(c2)} ${fmtPt(b2)}`;
};

const seg = (a: Vec, b: Vec) => polylinePath([a, b]);

/**
 * A ↪ hook: a semicircle starting at `start`, bulging backward, with its
 * free end on the frame's left (above a horizontal arrow, as in ↪ and ↩).
 */
const hook = (start: Vec, u: Vec, r: number, side: 1 | -1): string => {
  const n = scale(leftNormal(u), side);
  const k = 0.5523 * r; // cubic approximation of a quarter circle
  const centre = addScaled(start, n, r);
  const back = addScaled(centre, u, -r);
  const end = addScaled(centre, n, r);
  const f = fmtPt;
  return (
    `M${f(end)}C${f(addScaled(end, u, -k))} ${f(addScaled(back, n, k))} ${f(back)}` +
    `C${f(addScaled(back, n, -k))} ${f(addScaled(start, u, -k))} ${f(start)}`
  );
};

/** A squiggly polyline following `c`, flattening out toward both ends. */
const squiggle = (c: Cubic, style: Style): string => {
  const table = arcTable(c);
  const lambda = style.squiggleWavelength;
  const ramp = lambda / 2;
  const steps = Math.max(2, Math.ceil(table.total / (lambda / 10)));
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const s = (table.total * i) / steps;
    const t = tAtLength(table, s);
    const envelope = Math.min(1, s / ramp, (table.total - s) / ramp);
    const amp = style.squiggleAmplitude * envelope * Math.sin((2 * Math.PI * s) / lambda);
    return addScaled(point(c, t), leftNormal(tangent(c, t)), amp);
  });
  return polylinePath(pts);
};

/** Signed offsets of the parallel lines of an n-line arrow. */
const lineOffsets = (lines: number, gap: number): number[] =>
  Array.from({ length: lines }, (_, i) => (i - (lines - 1) / 2) * gap);

// ---------------------------------------------------------------------------
// Edge styles
// ---------------------------------------------------------------------------

interface Drawn {
  readonly strokes: Stroke[];
  readonly label: LabelLayout | null;
  readonly hitPath: Vec[];
  /** Extent of everything drawn, including stroke width. */
  readonly extent: Bounds;
}

const placeLabel = (
  curve: Cubic,
  e: Edge,
  spread: number,
  side: 1 | -1,
  style: Style,
  typeset: Typeset,
): { label: LabelLayout; t: number } | null => {
  const tex = typeset(e.label, "script");
  if (!tex) return null;
  const table = arcTable(curve);
  const t = tAtLength(table, e.options.labelPos * table.total);
  const p = point(curve, t);
  // The frame's left at this point of the (possibly curved) arrow.
  const n = scale(leftNormal(tangent(curve, t)), side);
  const w = tex.width * style.em;
  const h = (tex.ascent + tex.descent) * style.em;
  // Distance from the box centre to its edge in direction n (the box's support function).
  const support = (w / 2) * Math.abs(n.x) + (h / 2) * Math.abs(n.y);
  const away = support + style.labelGap + spread;
  const where = e.options.labelSide;
  const c = where === "left" ? addScaled(p, n, away) : where === "right" ? addScaled(p, n, -away) : p;
  return { label: { tex, box: { cx: c.x, cy: c.y, hw: w / 2, hh: h / 2 } }, t };
};

const drawArrow = (curve: Cubic, e: Edge, side: 1 | -1, style: Style, typeset: Typeset): Drawn => {
  const o = e.options;
  const spread = ((o.lines - 1) * style.lineGap) / 2;
  const headLen = style.headLength + spread * 0.6;
  const headHalf = style.headHalfWidth + spread;
  const strokes: Stroke[] = [];

  // Side labels clear the outermost line, including a squiggle's wave.
  const clearance = spread + (o.body === "squiggly" ? style.squiggleAmplitude : 0);
  const placed = placeLabel(curve, e, clearance, side, style, typeset);
  const label = placed?.label ?? null;

  // How far each line is pulled back from the ends to meet the head/tail
  // outlines instead of poking through them. Lines further from the centre
  // meet the (flaring) chevron arms sooner.
  const meetsChevron = (d: number) => (headLen * Math.abs(d)) / headHalf;
  const headRetract = (d: number) => (o.head === "none" ? 0 : d === 0 ? style.stroke / 2 : meetsChevron(d));
  const tailRetract = (d: number) => (o.tail === "mono" ? headLen - meetsChevron(d) : 0);

  // Break the shaft around a centred label.
  const gap =
    label && placed && o.labelSide === "centre"
      ? insideRange(curve, p => inBox(label.box, p, style.labelPad), placed.t)
      : null;
  const pieces: [number, number][] = gap ? [[0, gap[0]], [gap[1], 1]] : [[0, 1]];

  if (o.body !== "none") {
    for (const d of lineOffsets(o.lines, style.lineGap)) {
      const lc = offsetCurve(curve, d);
      const table = arcTable(lc);
      const start = tAtLength(table, tailRetract(d));
      const end = tAtLength(table, table.total - headRetract(d));
      for (const [a, b] of pieces) {
        const lo = Math.max(a, start);
        const hi = Math.min(b, end);
        if (hi - lo < 1e-3) continue;
        const piece = segment(lc, lo, hi);
        if (o.body === "squiggly") strokes.push({ d: squiggle(piece, style), dash: "solid" });
        else strokes.push({ d: cubicPath(piece), dash: o.body === "solid" ? "solid" : o.body });
      }
    }
  }

  const table = arcTable(curve);
  const tip = point(curve, 1);
  const tipDir = tangent(curve, 1);
  if (o.head !== "none") strokes.push({ d: chevron(tip, tipDir, headLen, headHalf), dash: "solid" });
  if (o.head === "epi") {
    const t2 = tAtLength(table, table.total - style.epiGap);
    strokes.push({ d: chevron(point(curve, t2), tangent(curve, t2), headLen, headHalf), dash: "solid" });
  }

  const start = point(curve, 0);
  const startDir = tangent(curve, 0);
  if (o.tail === "mono") {
    const t = tAtLength(table, headLen);
    strokes.push({ d: chevron(point(curve, t), tangent(curve, t), headLen, headHalf), dash: "solid" });
  } else if (o.tail === "maps-to") {
    const n = leftNormal(startDir);
    strokes.push({ d: seg(addScaled(start, n, headHalf), addScaled(start, n, -headHalf)), dash: "solid" });
  } else if (o.tail === "hook") {
    for (const d of lineOffsets(o.lines, style.lineGap)) {
      const lc = offsetCurve(curve, d);
      strokes.push({ d: hook(lc[0], tangent(lc, 0), style.hookRadius, side), dash: "solid" });
    }
  }

  const hitPath = sample(curve, 24);
  const pad = Math.max(headHalf, spread + style.squiggleAmplitude, 2 * style.hookRadius) + style.stroke;
  const extent = unionBounds(pointsBounds(hitPath, pad), label ? boxBounds(label.box) : pointsBounds([]));
  return { strokes, label, hitPath, extent };
};

/** ⊣ at the middle of the edge: stem toward the source, bar toward the target. */
const drawAdjunction = (curve: Cubic, style: Style): Drawn => {
  const table = arcTable(curve);
  const t = tAtLength(table, table.total / 2);
  const m = point(curve, t);
  const u = tangent(curve, t);
  const n = leftNormal(u);
  const a = style.turnstileSize;
  const stemFrom = addScaled(m, u, -a);
  const barMid = addScaled(m, u, a);
  const barA = addScaled(barMid, n, a);
  const barB = addScaled(barMid, n, -a);
  return {
    strokes: [
      { d: seg(stemFrom, barMid), dash: "solid" },
      { d: seg(barA, barB), dash: "solid" },
    ],
    label: null,
    hitPath: [stemFrom, barMid, barA, barB],
    extent: pointsBounds([stemFrom, barA, barB], style.stroke),
  };
};

/**
 * A right-angled corner whose vertex sits `cornerDistance` along the arrow
 * from one end and whose arms open back toward that end: pullback (⌟) at the
 * source, pushout (⌜) at the target.
 */
const drawCorner = (curve: Cubic, atSource: boolean, style: Style): Drawn => {
  const table = arcTable(curve);
  const t = tAtLength(table, atSource ? style.cornerDistance : table.total - style.cornerDistance);
  const v = point(curve, t);
  // Unit vector pointing from the corner back toward its object.
  const back = normalize(atSource ? sub(curve[0], curve[3]) : sub(curve[3], curve[0]));
  const arm1 = addScaled(v, rotate(back, Math.PI / 4), style.cornerSize);
  const arm2 = addScaled(v, rotate(back, -Math.PI / 4), style.cornerSize);
  return {
    strokes: [{ d: polylinePath([arm1, v, arm2]), dash: "solid" }],
    label: null,
    hitPath: [arm1, v, arm2],
    extent: pointsBounds([arm1, v, arm2], style.stroke),
  };
};

const degenerateEdge = (id: CellId, anchor: Vec): EdgeLayout => ({
  kind: "edge",
  id,
  curve: null,
  anchor,
  strokes: [],
  label: null,
  hitPath: [anchor],
  bounds: pointsBounds([anchor]),
  frame: null,
});

const layoutEdge = (
  e: Edge,
  byId: ReadonlyMap<CellId, CellLayout>,
  cellSize: number,
  style: Style,
  typeset: Typeset,
): EdgeLayout => {
  const src = byId.get(e.source);
  const tgt = byId.get(e.target);
  // Unreachable while the topological-order invariant holds; degrade rather than crash.
  if (!src || !tgt) return degenerateEdge(e.id, { x: 0, y: 0 });
  const a = endpointOf(src, style);
  const b = endpointOf(tgt, style);
  const loop = e.source === e.target;
  // Loops always run the same way round, so for them the direction of travel
  // is the frame: "left" is outside the loop.
  const side = loop ? 1 : frameSign(sub(b.p, a.p));

  const full = loop
    ? loopCurve(a.p, e.options, cellSize, style)
    : dist(a.p, b.p) < 1e-6
      ? null
      : edgeCurve(a.p, b.p, e.options, side, style);
  const curve = full && clip(full, a.shape, b.shape);

  // Endpoints overlap: nothing sensible to draw, but keep a usable anchor.
  if (!curve) return degenerateEdge(e.id, lerp(a.p, b.p, 0.5));

  const drawn =
    e.options.style === "arrow"
      ? drawArrow(curve, e, side, style, typeset)
      : e.options.style === "adjunction"
        ? drawAdjunction(curve, style)
        : drawCorner(curve, e.options.style === "pullback", style);

  const along = loop ? tangent(curve, 0.5) : normalize(sub(b.p, a.p));

  return {
    kind: "edge",
    id: e.id,
    curve,
    anchor: midpoint(curve),
    strokes: drawn.strokes,
    label: drawn.label,
    hitPath: drawn.hitPath,
    bounds: drawn.extent,
    frame: { along, left: scale(leftNormal(along), side) },
  };
};

// ---------------------------------------------------------------------------
// Whole diagram
// ---------------------------------------------------------------------------

export const layoutDiagram = (d: Diagram, style: Style, typeset: Typeset): Layout => {
  const byId = new Map<CellId, CellLayout>();
  const cells: CellLayout[] = [];
  for (const c of d.cells) {
    const l = c.kind === "vertex" ? layoutVertex(c, d.cellSize, style, typeset) : layoutEdge(c, byId, d.cellSize, style, typeset);
    byId.set(c.id, l);
    cells.push(l);
  }
  const bounds = cells.reduce<Bounds>((acc, c) => unionBounds(acc, c.bounds), pointsBounds([]));
  return { cells, byId, bounds, cellSize: d.cellSize };
};
