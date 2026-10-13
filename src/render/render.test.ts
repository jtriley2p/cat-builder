import { expect, test } from "bun:test";
import { cellsInRect, hitTest } from "../editor/hit";
import { layoutDiagram } from "../geometry/layout";
import { DEFAULT_STYLE } from "../geometry/style";
import { vec } from "../geometry/vec";
import { addEdge, addVertex, emptyDiagram } from "../model/diagram";
import type { Paint } from "../model/paint";
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

const BLACK: Paint = { color: "#000000", alpha: 1 };
const CLEAR: Paint = { color: "#ffffff", alpha: 0 };

test("standalone SVG is self-contained: no fonts, text, foreignObject or external references", () => {
  const layout = layoutDiagram(diagram(), DEFAULT_STYLE, typeset);
  const svg = standaloneSvg(layout, DEFAULT_STYLE, { padding: 10, background: CLEAR, stroke: BLACK });
  expect(svg).not.toBeNull();
  const m = svg!.markup;
  expect(m.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  for (const banned of ["<text", "foreignObject", "<use", "href=", "@font-face", "data-"]) expect(m).not.toContain(banned);
  expect(svg!.width).toBeGreaterThan(100);
});

test("empty diagrams have nothing to export", () => {
  const layout = layoutDiagram(emptyDiagram(), DEFAULT_STYLE, typeset);
  expect(standaloneSvg(layout, DEFAULT_STYLE, { padding: 10, background: CLEAR, stroke: BLACK })).toBeNull();
});

test("paint opacity becomes portable SVG attributes", () => {
  const layout = layoutDiagram(diagram(), DEFAULT_STYLE, typeset);
  const svg = (background: Paint, stroke: Paint) => standaloneSvg(layout, DEFAULT_STYLE, { padding: 10, background, stroke })!.markup;

  // Fully transparent background: no rect at all. Opaque paints: no opacity attributes.
  const plain = svg(CLEAR, BLACK);
  expect(plain).not.toContain("<rect");
  expect(plain).not.toContain("opacity");

  const faded = svg({ color: "#336699", alpha: 0.25 }, { color: "#aa0000", alpha: 0.5 });
  expect(faded).toContain('fill="#336699" fill-opacity="0.25"');
  expect(faded).toContain('<g color="#aa0000" opacity="0.5"');
  expect(svg({ color: "#336699", alpha: 1 }, BLACK)).toContain('fill="#336699"/>');
});

test("hit-testing: labels, then the nearest arrow, then the rest of an object's square", () => {
  const layout = layoutDiagram(diagram(), DEFAULT_STYLE, typeset);
  expect(hitTest(layout, vec(0, 0), 6)).toEqual({ kind: "vertex", id: "c1" });
  // The arrow passes through C's and D's squares; near it, the arrow wins.
  expect(hitTest(layout, vec(30, 1), 6)).toEqual({ kind: "edge", id: "c3" });
  expect(hitTest(layout, vec(50, 1), 6)).toEqual({ kind: "edge", id: "c3" });
  // Elsewhere in a square (100px cells, objects at their centres) the square's object wins.
  expect(hitTest(layout, vec(-40, 40), 6)).toEqual({ kind: "vertex", id: "c1" });
  expect(hitTest(layout, vec(140, -45), 6)).toEqual({ kind: "vertex", id: "c2" });
  // Empty squares hit nothing.
  expect(hitTest(layout, vec(0, 100), 6)).toBeNull();
  expect(hitTest(layout, vec(250, 0), 6)).toBeNull();
  expect(cellsInRect(layout, vec(-10, -10), vec(60, 10)).sort()).toEqual(["c1", "c3"]);
});
