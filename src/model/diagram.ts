/**
 * Pure operations on a `Diagram`. Every function returns a new diagram (or a
 * `Result` when the operation can be rejected) and never mutates its input.
 */
import { err, ok, type Result } from "../lib/result";
import {
  CELL_SIZE_RANGE,
  CURVE_RANGE,
  DEFAULT_COLORS,
  DEFAULT_EDGE_OPTIONS,
  FONT_SIZE_RANGE,
  OFFSET_RANGE,
  STROKE_WIDTH_RANGE,
  type Cell,
  type CellId,
  type Colors,
  type Diagram,
  type Edge,
  type EdgeOptions,
  type Vertex,
} from "./types";

export const emptyDiagram = (cellSize: number = CELL_SIZE_RANGE.default, colors: Colors = DEFAULT_COLORS): Diagram => ({
  cellSize,
  colors,
  fontSize: FONT_SIZE_RANGE.default,
  strokeWidth: STROKE_WIDTH_RANGE.default,
  cells: [],
  nextId: 1,
});

/** The diagram with every cell removed, keeping its settings (spacing, colours, sizes). */
export const clearCells = (d: Diagram): Diagram => ({ ...d, cells: [], nextId: 1 });

/** Look up a cell by id. Linear, which is fine at diagram scale (tens of cells). */
export const getCell = (d: Diagram, id: CellId): Cell | undefined => d.cells.find(c => c.id === id);

export const vertexAt = (d: Diagram, col: number, row: number): Vertex | undefined =>
  d.cells.find((c): c is Vertex => c.kind === "vertex" && c.col === col && c.row === row);

export const isLoop = (e: Edge): boolean => e.source === e.target;

const freshId = (d: Diagram): [CellId, Diagram] => [`c${d.nextId}`, { ...d, nextId: d.nextId + 1 }];

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export type AddVertexError = "occupied";

export const addVertex = (
  d: Diagram,
  col: number,
  row: number,
  label: string,
): Result<{ diagram: Diagram; id: CellId }, AddVertexError> => {
  if (vertexAt(d, col, row)) return err("occupied");
  const [id, d2] = freshId(d);
  const vertex: Vertex = { kind: "vertex", id, col, row, label };
  return ok({ diagram: { ...d2, cells: [...d2.cells, vertex] }, id });
};

/**
 * - `missing-endpoint`: source or target is not in the diagram.
 * - `edge-loop`: an arrow from an arrow to itself (loops are only meaningful on vertices).
 */
export type AddEdgeError = "missing-endpoint" | "edge-loop";

export const addEdge = (
  d: Diagram,
  source: CellId,
  target: CellId,
  label: string = "",
  options: Partial<EdgeOptions> = {},
): Result<{ diagram: Diagram; id: CellId }, AddEdgeError> => {
  const s = getCell(d, source);
  const t = getCell(d, target);
  if (!s || !t) return err("missing-endpoint");
  if (source === target && s.kind === "edge") return err("edge-loop");
  const [id, d2] = freshId(d);
  const edge: Edge = {
    kind: "edge",
    id,
    source,
    target,
    label,
    options: normalizeOptions({ ...DEFAULT_EDGE_OPTIONS, ...options }),
  };
  // Appending keeps the topological-order invariant: both endpoints already exist.
  return ok({ diagram: { ...d2, cells: [...d2.cells, edge] }, id });
};

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

const mapCells = (d: Diagram, ids: ReadonlySet<CellId>, f: (c: Cell) => Cell): Diagram => ({
  ...d,
  cells: d.cells.map(c => (ids.has(c.id) ? f(c) : c)),
});

export const setLabel = (d: Diagram, id: CellId, label: string): Diagram =>
  mapCells(d, new Set([id]), c => ({ ...c, label }));

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Clamp numeric options into their allowed ranges. */
export const normalizeOptions = (o: EdgeOptions): EdgeOptions => ({
  ...o,
  labelPos: clamp(o.labelPos, 0, 1),
  curve: clamp(Math.round(o.curve), CURVE_RANGE.min, CURVE_RANGE.max),
  offset: clamp(Math.round(o.offset), OFFSET_RANGE.min, OFFSET_RANGE.max),
  loopAngle: ((Math.round(o.loopAngle) % 360) + 360) % 360,
});

/** Apply an options patch to every listed edge (vertices in `ids` are ignored). */
export const updateEdgeOptions = (d: Diagram, ids: Iterable<CellId>, patch: Partial<EdgeOptions>): Diagram =>
  mapCells(d, new Set(ids), c =>
    c.kind === "edge" ? { ...c, options: normalizeOptions({ ...c.options, ...patch }) } : c,
  );

/** Swap source and target of every listed edge. Order invariant is unaffected. */
export const reverseEdges = (d: Diagram, ids: Iterable<CellId>): Diagram =>
  mapCells(d, new Set(ids), c => (c.kind === "edge" ? { ...c, source: c.target, target: c.source } : c));

export const setCellSize = (d: Diagram, cellSize: number): Diagram => ({
  ...d,
  cellSize: clamp(Math.round(cellSize), CELL_SIZE_RANGE.min, CELL_SIZE_RANGE.max),
});

export const setColors = (d: Diagram, patch: Partial<Colors>): Diagram => ({ ...d, colors: { ...d.colors, ...patch } });

export const setFontSize = (d: Diagram, fontSize: number): Diagram => ({
  ...d,
  fontSize: clamp(Math.round(fontSize), FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max),
});

export const setStrokeWidth = (d: Diagram, strokeWidth: number): Diagram => ({
  ...d,
  strokeWidth: clamp(Math.round(strokeWidth * 10) / 10, STROKE_WIDTH_RANGE.min, STROKE_WIDTH_RANGE.max),
});

export type MoveError = "occupied";

/**
 * Translate the listed vertices by a whole number of grid cells. Rejected if
 * any moved vertex would land on a vertex that is not itself moving.
 */
export const moveVertices = (
  d: Diagram,
  ids: Iterable<CellId>,
  dCol: number,
  dRow: number,
): Result<Diagram, MoveError> => {
  const moving = new Set(ids);
  const key = (col: number, row: number) => `${col},${row}`;
  const stationary = new Set(
    d.cells.filter((c): c is Vertex => c.kind === "vertex" && !moving.has(c.id)).map(v => key(v.col, v.row)),
  );
  const collides = d.cells.some(
    c => c.kind === "vertex" && moving.has(c.id) && stationary.has(key(c.col + dCol, c.row + dRow)),
  );
  if (collides) return err("occupied");
  return ok(mapCells(d, moving, c => (c.kind === "vertex" ? { ...c, col: c.col + dCol, row: c.row + dRow } : c)));
};

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/**
 * The given cells plus everything that (transitively) depends on them, i.e.
 * every edge with an endpoint in the set. One forward pass suffices thanks to
 * the topological-order invariant.
 */
export const withDependents = (d: Diagram, ids: Iterable<CellId>): Set<CellId> => {
  const doomed = new Set(ids);
  for (const c of d.cells) {
    if (c.kind === "edge" && (doomed.has(c.source) || doomed.has(c.target))) doomed.add(c.id);
  }
  return doomed;
};

/** Remove cells, cascading to every edge that depends on them. */
export const removeCells = (d: Diagram, ids: Iterable<CellId>): Diagram => {
  const doomed = withDependents(d, ids);
  return { ...d, cells: d.cells.filter(c => !doomed.has(c.id)) };
};
