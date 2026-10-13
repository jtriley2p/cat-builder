/**
 * Cubic Bézier curves: the single curve representation used for every arrow
 * (straight arrows are degenerate cubics, bends are elevated quadratics, and
 * loops are genuine cubics).
 */
import { add, addScaled, cross, dist, lerp, normalize, leftNormal, sub, type Vec } from "./vec";

export type Cubic = readonly [Vec, Vec, Vec, Vec];

export const line = (a: Vec, b: Vec): Cubic => [a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b];

/** Degree-elevate a quadratic (a, q, b) to the equivalent cubic. */
export const fromQuadratic = (a: Vec, q: Vec, b: Vec): Cubic => [a, lerp(a, q, 2 / 3), lerp(b, q, 2 / 3), b];

export const point = ([p0, p1, p2, p3]: Cubic, t: number): Vec => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
};

export const derivative = ([p0, p1, p2, p3]: Cubic, t: number): Vec => {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return {
    x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
  };
};

/**
 * Unit tangent at `t`. Where the derivative vanishes (coincident control
 * points at an end) we nudge inward, falling back to the chord direction.
 */
export const tangent = (c: Cubic, t: number): Vec => {
  const d = derivative(c, t);
  if (Math.hypot(d.x, d.y) > 1e-6) return normalize(d);
  const nudged = derivative(c, t < 0.5 ? t + 1e-3 : t - 1e-3);
  if (Math.hypot(nudged.x, nudged.y) > 1e-9) return normalize(nudged);
  return normalize(sub(c[3], c[0]));
};

/** de Casteljau split at `t`. */
export const split = (c: Cubic, t: number): [Cubic, Cubic] => {
  const [p0, p1, p2, p3] = c;
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const d = lerp(p2, p3, t);
  const ab = lerp(a, b, t);
  const bd = lerp(b, d, t);
  const m = lerp(ab, bd, t);
  return [
    [p0, a, ab, m],
    [m, bd, d, p3],
  ];
};

/** The portion of `c` between parameters `t0 < t1`, reparameterised to [0, 1]. */
export const segment = (c: Cubic, t0: number, t1: number): Cubic => {
  if (t0 <= 0 && t1 >= 1) return c;
  const right = split(c, Math.max(0, t0))[1];
  const t = (t1 - t0) / (1 - t0);
  return t >= 1 ? right : split(right, t)[0];
};

export const sample = (c: Cubic, n: number): Vec[] => Array.from({ length: n + 1 }, (_, i) => point(c, i / n));

// ---------------------------------------------------------------------------
// Arc length
// ---------------------------------------------------------------------------

/**
 * A lookup table from parameter to cumulative arc length, for converting
 * between "distance along the arrow" and curve parameter.
 */
export interface ArcTable {
  readonly ts: readonly number[];
  readonly lengths: readonly number[];
  readonly total: number;
}

const ARC_SAMPLES = 64;

export const arcTable = (c: Cubic): ArcTable => {
  const ts: number[] = [0];
  const lengths: number[] = [0];
  let prev = c[0];
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const t = i / ARC_SAMPLES;
    const p = point(c, t);
    ts.push(t);
    lengths.push(lengths[i - 1]! + dist(prev, p));
    prev = p;
  }
  return { ts, lengths, total: lengths[ARC_SAMPLES]! };
};

/** Parameter at which the arc length from the start equals `s` (clamped). */
export const tAtLength = (table: ArcTable, s: number): number => {
  const { ts, lengths, total } = table;
  if (s <= 0) return 0;
  if (s >= total) return 1;
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid]! < s) lo = mid;
    else hi = mid;
  }
  const span = lengths[hi]! - lengths[lo]!;
  const f = span < 1e-12 ? 0 : (s - lengths[lo]!) / span;
  return ts[lo]! + f * (ts[hi]! - ts[lo]!);
};

/** Remove `startLen` px of arc from the start and `endLen` px from the end. Null if nothing remains. */
export const trimByLength = (c: Cubic, startLen: number, endLen: number): Cubic | null => {
  if (startLen <= 0 && endLen <= 0) return c;
  const table = arcTable(c);
  if (startLen + endLen >= table.total - 1e-6) return null;
  return segment(c, tAtLength(table, startLen), tAtLength(table, table.total - endLen));
};

// ---------------------------------------------------------------------------
// Offsetting (for double/triple lines)
// ---------------------------------------------------------------------------

/** Intersection of lines (p + s·u) and (q + t·v), or null when (nearly) parallel. */
const intersectLines = (p: Vec, u: Vec, q: Vec, v: Vec): Vec | null => {
  const denom = cross(u, v);
  if (Math.abs(denom) < 1e-6) return null;
  return addScaled(p, u, cross(sub(q, p), v) / denom);
};

/**
 * Approximate parallel curve at signed distance `d` (positive = left of
 * travel), using the Tiller–Hanson construction: offset each leg of the
 * control polygon and rebuild the control points from the legs'
 * intersections. Exact for straight lines; very close for the gentle bends
 * and small offsets used for multi-line arrows.
 */
export const offset = (c: Cubic, d: number): Cubic => {
  if (d === 0) return c;
  const [p0, p1, p2, p3] = c;
  const n0 = leftNormal(tangent(c, 0));
  const n3 = leftNormal(tangent(c, 1));
  const q0 = addScaled(p0, n0, d);
  const q3 = addScaled(p3, n3, d);
  const legs: [Vec, Vec][] = [
    [p0, p1],
    [p1, p2],
    [p2, p3],
  ];
  // Directions of each leg; degenerate legs borrow the end tangents.
  const dirs = legs.map(([a, b], i) =>
    dist(a, b) > 1e-6 ? normalize(sub(b, a)) : tangent(c, i === 0 ? 0 : i === 2 ? 1 : 0.5),
  );
  const shifted = legs.map(([a], i) => addScaled(a, leftNormal(dirs[i]!), d));
  const q1 = intersectLines(shifted[0]!, dirs[0]!, shifted[1]!, dirs[1]!);
  const q2 = intersectLines(shifted[1]!, dirs[1]!, shifted[2]!, dirs[2]!);
  // Parallel legs (straight or nearly straight curves): translating is exact enough.
  return [q0, q1 ?? addScaled(p1, n0, d), q2 ?? addScaled(p2, n3, d), q3];
};

// ---------------------------------------------------------------------------
// Clipping against shapes
// ---------------------------------------------------------------------------

/** A region an arrow should start or stop at the boundary of. */
export type Shape =
  | { readonly kind: "box"; readonly cx: number; readonly cy: number; readonly hw: number; readonly hh: number }
  | { readonly kind: "circle"; readonly c: Vec; readonly r: number };

export const inShape = (s: Shape, p: Vec): boolean =>
  s.kind === "box"
    ? Math.abs(p.x - s.cx) <= s.hw && Math.abs(p.y - s.cy) <= s.hh
    : dist(p, s.c) <= s.r;

const CLIP_SAMPLES = 64;
const BISECT_STEPS = 24;

/** Bisect for the boundary crossing of `inside` between `tIn` (inside) and `tOut` (outside). */
const bisect = (c: Cubic, inside: (p: Vec) => boolean, tIn: number, tOut: number): number => {
  let a = tIn;
  let b = tOut;
  for (let i = 0; i < BISECT_STEPS; i++) {
    const m = (a + b) / 2;
    if (inside(point(c, m))) a = m;
    else b = m;
  }
  return b;
};

/**
 * Parameter where the curve first leaves `inside`, scanning from t = 0
 * (`fromStart`) or backwards from t = 1. Returns the starting parameter if the
 * curve begins outside, and null if it never leaves.
 */
export const exitParam = (c: Cubic, inside: (p: Vec) => boolean, fromStart: boolean): number | null => {
  const at = (i: number) => (fromStart ? i / CLIP_SAMPLES : 1 - i / CLIP_SAMPLES);
  if (!inside(point(c, at(0)))) return at(0);
  for (let i = 1; i <= CLIP_SAMPLES; i++) {
    if (!inside(point(c, at(i)))) return bisect(c, inside, at(i - 1), at(i));
  }
  return null;
};

/**
 * The parameter range [tIn, tOut] around `tHint` where the curve lies inside
 * `inside`, or null if the curve is outside at `tHint`. Used to break an
 * arrow around a label drawn on top of it.
 */
export const insideRange = (c: Cubic, inside: (p: Vec) => boolean, tHint: number): [number, number] | null => {
  if (!inside(point(c, tHint))) return null;
  const step = 1 / CLIP_SAMPLES;
  let lo = tHint;
  while (lo > 0 && inside(point(c, Math.max(0, lo - step)))) lo = Math.max(0, lo - step);
  let hi = tHint;
  while (hi < 1 && inside(point(c, Math.min(1, hi + step)))) hi = Math.min(1, hi + step);
  const tIn = lo <= 0 ? 0 : bisect(c, inside, lo, Math.max(0, lo - step));
  const tOut = hi >= 1 ? 1 : bisect(c, inside, hi, Math.min(1, hi + step));
  return [tIn, tOut];
};

// ---------------------------------------------------------------------------
// SVG path data
// ---------------------------------------------------------------------------

/** Round to 2 decimals for compact, stable SVG output. */
export const fmt = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

export const fmtPt = (p: Vec): string => `${fmt(p.x)} ${fmt(p.y)}`;

export const cubicPath = (c: Cubic): string =>
  `M${fmtPt(c[0])}C${fmtPt(c[1])} ${fmtPt(c[2])} ${fmtPt(c[3])}`;

export const polylinePath = (pts: readonly Vec[]): string =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"}${fmtPt(p)}`).join("");

/** Translate a curve. */
export const translate = (c: Cubic, d: Vec): Cubic => [add(c[0], d), add(c[1], d), add(c[2], d), add(c[3], d)];

export const midpoint = (c: Cubic): Vec => {
  const table = arcTable(c);
  return point(c, tAtLength(table, table.total / 2));
};
