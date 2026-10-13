/**
 * 2D vectors in *screen* coordinates: x grows rightward, y grows downward.
 * All functions are pure and allocate new vectors.
 */

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** `a + k·b`, the workhorse of offsetting along a direction. */
export const addScaled = (a: Vec, b: Vec, k: number): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** Unit vector in the direction of `a`; the zero vector maps to (1, 0) to keep callers total. */
export const normalize = (a: Vec): Vec => {
  const l = len(a);
  return l < 1e-9 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
};

/**
 * The unit normal pointing to the *left* of travel along direction `d`
 * (e.g. "up" for a rightward arrow), matching tikz-cd's notion of left.
 */
export const leftNormal = (d: Vec): Vec => normalize({ x: d.y, y: -d.x });

/** Rotate by `rad` radians (clockwise on screen, since y points down). */
export const rotate = (a: Vec, rad: number): Vec => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};

export const fromAngle = (rad: number): Vec => ({ x: Math.cos(rad), y: Math.sin(rad) });

/** Distance from point `p` to the segment `ab`. */
export const distToSegment = (p: Vec, a: Vec, b: Vec): number => {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, addScaled(a, ab, t));
};

/** Axis-aligned rectangle given by its centre and half-extents. */
export interface Box {
  readonly cx: number;
  readonly cy: number;
  readonly hw: number;
  readonly hh: number;
}

export const inBox = (b: Box, p: Vec, pad = 0): boolean =>
  Math.abs(p.x - b.cx) <= b.hw + pad && Math.abs(p.y - b.cy) <= b.hh + pad;

/** Bounding rectangle as min/max corners. */
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export const EMPTY_BOUNDS: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

export const isEmptyBounds = (b: Bounds): boolean => b.minX > b.maxX || b.minY > b.maxY;

export const unionBounds = (a: Bounds, b: Bounds): Bounds => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

/** Bounds of a set of points, each grown by `pad` in every direction. */
export const pointsBounds = (pts: readonly Vec[], pad = 0): Bounds =>
  pts.reduce<Bounds>(
    (b, p) => ({
      minX: Math.min(b.minX, p.x - pad),
      minY: Math.min(b.minY, p.y - pad),
      maxX: Math.max(b.maxX, p.x + pad),
      maxY: Math.max(b.maxY, p.y + pad),
    }),
    EMPTY_BOUNDS,
  );

export const boxBounds = (b: Box): Bounds => ({
  minX: b.cx - b.hw,
  minY: b.cy - b.hh,
  maxX: b.cx + b.hw,
  maxY: b.cy + b.hh,
});
