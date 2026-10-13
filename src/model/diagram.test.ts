import { describe, expect, test } from "bun:test";
import {
  addEdge,
  addVertex,
  clearCells,
  emptyDiagram,
  moveVertices,
  removeCells,
  reverseEdges,
  setFontSize,
  setStrokeWidth,
  updateEdgeOptions,
  vertexAt,
} from "./diagram";
import { FONT_SIZE_RANGE, STROKE_WIDTH_RANGE, type Diagram } from "./types";

/** Unwrap a Result in tests, failing loudly on the error branch. */
const must = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`unexpected error: ${JSON.stringify(r.error)}`);
  return r.value;
};

/** A → B with an arrow f, plus g: A → B and a 2-cell f ⇒ g. */
const sample = () => {
  let d: Diagram = emptyDiagram();
  const a = must(addVertex(d, 0, 0, "A"));
  d = a.diagram;
  const b = must(addVertex(d, 1, 0, "B"));
  d = b.diagram;
  const f = must(addEdge(d, a.id, b.id, "f"));
  d = f.diagram;
  const g = must(addEdge(d, a.id, b.id, "g"));
  d = g.diagram;
  const alpha = must(addEdge(d, f.id, g.id, "\\alpha"));
  d = alpha.diagram;
  return { d, a: a.id, b: b.id, f: f.id, g: g.id, alpha: alpha.id };
};

describe("diagram operations", () => {
  test("vertices cannot share a grid position", () => {
    const { d } = sample();
    expect(addVertex(d, 0, 0, "X")).toEqual({ ok: false, error: "occupied" });
    expect(vertexAt(d, 1, 0)?.label).toBe("B");
  });

  test("edges need existing endpoints and cannot loop on an edge", () => {
    const { d, a, f } = sample();
    expect(addEdge(d, a, "nope")).toEqual({ ok: false, error: "missing-endpoint" });
    expect(addEdge(d, f, f)).toEqual({ ok: false, error: "edge-loop" });
    // Loops on vertices are fine.
    expect(addEdge(d, a, a).ok).toBe(true);
  });

  test("removing a vertex cascades to every dependent edge, transitively", () => {
    const { d, a, b } = sample();
    const after = removeCells(d, [a]);
    expect(after.cells.map(c => c.id)).toEqual([b]);
  });

  test("removing an arrow removes 2-cells attached to it but not its endpoints", () => {
    const { d, a, b, g } = sample();
    const after = removeCells(d, [g]);
    expect(after.cells.map(c => c.id).sort()).toEqual([a, b, sample().f].sort());
  });

  test("moving is rejected onto a stationary vertex but allowed when swapping as a group", () => {
    const { d, a, b } = sample();
    expect(moveVertices(d, [a], 1, 0)).toEqual({ ok: false, error: "occupied" });
    const moved = must(moveVertices(d, [a, b], 1, 0));
    expect(vertexAt(moved, 1, 0)?.id).toBe(a);
    expect(vertexAt(moved, 2, 0)?.id).toBe(b);
  });

  test("option updates are clamped and only touch edges", () => {
    const { d, a, f } = sample();
    const after = updateEdgeOptions(d, [a, f], { curve: 99, offset: -2.4, labelPos: 3, loopAngle: -90 });
    const edge = after.cells.find(c => c.id === f);
    expect(edge?.kind === "edge" && edge.options).toMatchObject({ curve: 5, offset: -2, labelPos: 1, loopAngle: 270 });
    expect(after.cells.find(c => c.id === a)).toEqual(d.cells.find(c => c.id === a)!);
  });

  test("reverse swaps endpoints", () => {
    const { d, a, b, f } = sample();
    const e = reverseEdges(d, [f]).cells.find(c => c.id === f);
    expect(e?.kind === "edge" && [e.source, e.target]).toEqual([b, a]);
  });

  test("operations never mutate their input", () => {
    const { d, a } = sample();
    const snapshot = JSON.stringify(d);
    removeCells(d, [a]);
    must(moveVertices(d, [a], 0, 5));
    updateEdgeOptions(d, d.cells.map(c => c.id), { lines: 2 });
    expect(JSON.stringify(d)).toBe(snapshot);
  });
});

describe("diagram settings", () => {
  test("font size and stroke width are rounded and clamped to their ranges", () => {
    const d = emptyDiagram();
    expect(setFontSize(d, 23.6).fontSize).toBe(24);
    expect(setFontSize(d, 1).fontSize).toBe(FONT_SIZE_RANGE.min);
    expect(setFontSize(d, 999).fontSize).toBe(FONT_SIZE_RANGE.max);
    expect(setStrokeWidth(d, 1.7000000000000002).strokeWidth).toBe(1.7);
    expect(setStrokeWidth(d, 0).strokeWidth).toBe(STROKE_WIDTH_RANGE.min);
    expect(setStrokeWidth(d, 99).strokeWidth).toBe(STROKE_WIDTH_RANGE.max);
  });

  test("clearing removes every cell but keeps the settings", () => {
    let d = setStrokeWidth(setFontSize(emptyDiagram(150), 30), 2);
    d = must(addVertex(d, 0, 0, "A")).diagram;
    const cleared = clearCells(d);
    expect(cleared.cells).toEqual([]);
    expect({ ...cleared, cells: d.cells, nextId: d.nextId }).toEqual(d);
  });
});
