import { expect, test } from "bun:test";
import { cellsInRect, hitTest } from "../editor/hit";
import { layoutDiagram } from "../geometry/layout";
import { DEFAULT_STYLE } from "../geometry/style";
import { vec } from "../geometry/vec";
import { addEdge, addVertex, emptyDiagram } from "../model/diagram";
import { standaloneSvg } from "./svg";
import { typeset } from "./tex";

const diagram = () => {
  let d = emptyDiagram(100);
  const a = addVertex(d, 0, 0, "\\mathcal{C}");
  if (!a.ok) throw 0;
  d = a.value.diagram;
  const b = addVertex(d, 1, 0, "\\mathcal{D}");
  if (!b.ok) throw 0;
  d = b.value.diagram;
  const f = addEdge(d, a.value.id, b.value.id, "F");
  if (!f.ok) throw 0;
  return f.value.diagram;
};

test("typeset produces paths and reports TeX errors without throwing", () => {
  const ok = typeset("\\mathcal{C}", "normal");
  expect(ok?.error).toBeNull();
  expect(ok?.body).toContain("<path");
  expect(ok!.width).toBeGreaterThan(0);
  expect(typeset("  ", "normal")).toBeNull();
  expect(typeset("\\notamacro", "normal")?.error).toContain("Undefined control sequence");
  expect(typeset("x^{", "script")?.error).toBeTruthy();
});

test("standalone SVG is self-contained: no fonts, text, foreignObject or external references", () => {
  const layout = layoutDiagram(diagram(), DEFAULT_STYLE, typeset);
  const svg = standaloneSvg(layout, DEFAULT_STYLE, { padding: 10, background: null, ink: "#000" });
  expect(svg).not.toBeNull();
  const m = svg!.markup;
  expect(m.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  for (const banned of ["<text", "foreignObject", "<use", "href=", "@font-face", "data-"]) expect(m).not.toContain(banned);
  expect(svg!.width).toBeGreaterThan(100);
});

test("empty diagrams have nothing to export", () => {
  const layout = layoutDiagram(emptyDiagram(), DEFAULT_STYLE, typeset);
  expect(standaloneSvg(layout, DEFAULT_STYLE, { padding: 10, background: null, ink: "#000" })).toBeNull();
});

test("hit-testing prefers vertices, then the nearest arrow", () => {
  const layout = layoutDiagram(diagram(), DEFAULT_STYLE, typeset);
  expect(hitTest(layout, vec(0, 0), 6)).toEqual({ kind: "vertex", id: "c1" });
  expect(hitTest(layout, vec(50, 1), 6)).toEqual({ kind: "edge", id: "c3" });
  expect(hitTest(layout, vec(50, 40), 6)).toBeNull();
  expect(cellsInRect(layout, vec(-10, -10), vec(60, 10)).sort()).toEqual(["c1", "c3"]);
});
