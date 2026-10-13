/**
 * Core document model.
 *
 * A diagram is an ordered list of *cells*. A cell is either a vertex (an
 * object placed on an integer grid position) or an edge (an arrow whose
 * endpoints are other cells, so arrows may run between objects *or* between
 * other arrows, e.g. 2-cells / natural transformations).
 *
 * Invariant: every edge appears in `cells` after both of its endpoints. This
 * gives a topological order for free, which layout relies on (an edge's
 * geometry depends on the geometry of its endpoints). Operations in
 * `diagram.ts` preserve it; the codec validates it on load.
 */

/** Session-local identifier of a cell. Not part of the serialized form. */
export type CellId = string;

export interface Vertex {
  readonly kind: "vertex";
  readonly id: CellId;
  /** Grid column (x), may be negative: the grid is unbounded. */
  readonly col: number;
  /** Grid row (y), may be negative. */
  readonly row: number;
  /** TeX source of the label; empty string means "unlabelled point". */
  readonly label: string;
}

/**
 * How an edge is drawn as a whole.
 * - `arrow`: an ordinary arrow, styled by tail/body/head/lines.
 * - `adjunction`: a ⊣ symbol at the middle of the edge, its bar facing the target.
 * - `pullback`: a ⌟ corner near the source, pointing toward the target.
 * - `pushout`: a ⌜ corner near the target, pointing toward the source.
 */
export const EDGE_STYLES = ["arrow", "adjunction", "pullback", "pushout"] as const;
export type EdgeStyle = (typeof EDGE_STYLES)[number];

/**
 * Where an arrow's label sits relative to the arrow (relative to direction of
 * travel, like tikz-cd: `left` is the default, `right` is tikz-cd's `'`).
 * - `centre`: on the arrow, with the arrow broken around the label.
 * - `over`: on the arrow, drawn over an unbroken arrow.
 */
export const LABEL_SIDES = ["left", "right", "centre", "over"] as const;
export type LabelSide = (typeof LABEL_SIDES)[number];

/** Tail decorations: none, mono (↣), hook (↪), maps-to (↦). */
export const TAIL_STYLES = ["none", "mono", "hook", "maps-to"] as const;
export type TailStyle = (typeof TAIL_STYLES)[number];

/** Body (shaft) styles; `none` draws no shaft at all (useful for phantom arrows). */
export const BODY_STYLES = ["solid", "dashed", "dotted", "squiggly", "none"] as const;
export type BodyStyle = (typeof BODY_STYLES)[number];

/** Head decorations: arrow (→), epi (↠), none. */
export const HEAD_STYLES = ["arrow", "epi", "none"] as const;
export type HeadStyle = (typeof HEAD_STYLES)[number];

/** Number of parallel shaft lines: 1 (→), 2 (⇒), 3 (⇛). */
export const LINE_COUNTS = [1, 2, 3] as const;
export type LineCount = (typeof LINE_COUNTS)[number];

/** Bounds of the integer-valued edge options. */
export const CURVE_RANGE = { min: -5, max: 5 } as const;
export const OFFSET_RANGE = { min: -5, max: 5 } as const;

export interface EdgeOptions {
  readonly style: EdgeStyle;
  readonly labelSide: LabelSide;
  /** Label position along the arrow, 0 (tail) … 1 (head). */
  readonly labelPos: number;
  readonly tail: TailStyle;
  readonly body: BodyStyle;
  readonly head: HeadStyle;
  readonly lines: LineCount;
  /** Bend, in steps of 15°; positive bends to the left of travel. For loops it scales the loop size. */
  readonly curve: number;
  /** Parallel shift, in fixed steps; positive shifts to the left of travel. */
  readonly offset: number;
  /** Direction a loop points, in degrees in [0, 360): 0 = right, 90 = down (screen coordinates). Loops only. */
  readonly loopAngle: number;
}

export interface Edge {
  readonly kind: "edge";
  readonly id: CellId;
  readonly source: CellId;
  readonly target: CellId;
  /** TeX source of the label; empty string means no label. */
  readonly label: string;
  readonly options: EdgeOptions;
}

export type Cell = Vertex | Edge;

export interface Diagram {
  /** Distance between adjacent grid points, in px. */
  readonly cellSize: number;
  /** Cells in topological order (see module docs). */
  readonly cells: readonly Cell[];
  /** Counter for generating fresh, session-unique cell ids. */
  readonly nextId: number;
}

export const DEFAULT_EDGE_OPTIONS: EdgeOptions = {
  style: "arrow",
  labelSide: "left",
  labelPos: 0.5,
  tail: "none",
  body: "solid",
  head: "arrow",
  lines: 1,
  curve: 0,
  offset: 0,
  loopAngle: 270,
};

export const CELL_SIZE_RANGE = { min: 50, max: 250, default: 100 } as const;

/** Label given to vertices created by double-clicking the grid. */
export const DEFAULT_VERTEX_LABEL = "\\bullet";
