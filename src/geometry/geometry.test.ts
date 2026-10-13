import { describe, expect, test } from "bun:test";
import { addEdge, addVertex, emptyDiagram } from "../model/diagram";
import type { Diagram, EdgeOptions } from "../model/types";
import type { TexBox } from "../render/tex";
import { arcTable, exitParam, line, offset, point, segment, split } from "./bezier";
import { layoutDiagram, type EdgeLayout, type Typeset } from "./layout";
import { DEFAULT_STYLE } from "./style";
import { dist, inBox, vec } from "./vec";

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("bezier", () => {
  test("split and segment preserve endpoints", () => {
    const c = line(vec(0, 0), vec(30, 0));
    const [l, r] = split(c, 0.25);
    close(l[3].x, 7.5);
    close(r[0].x, 7.5);
    const s = segment(c, 0.2, 0.6);
    close(s[0].x, 6);
    close(s[3].x, 18);
  });

  test("arc length of a straight line", () => {
    close(arcTable(line(vec(0, 0), vec(3, 4))).total, 5, 1e-9);
  });

  test("offsetting a straight line translates it to the left of travel", () => {
    // Rightward on screen: left is up (negative y).
    const o = offset(line(vec(0, 0), vec(10, 0)), 2);
    o.forEach(p => close(p.y, -2));
  });

  test("exitParam finds the boundary of a shape", () => {
    const c = line(vec(0, 0), vec(100, 0));
    const t = exitParam(c, p => p.x <= 25, true);
    expect(t).not.toBeNull();
    close(point(c, t!).x, 25, 1e-3);
    expect(exitParam(c, () => true, true)).toBeNull();
  });
});

/** A stand-in typesetter: every label is 1em × 1em, centred on the math axis. */
const fakeTypeset: Typeset = (tex, size) =>
  tex === ""
    ? null
    : ({
        viewBox: "0 -750 1000 1000",
        body: "",
        width: size === "script" ? 0.7 : 1,
        ascent: size === "script" ? 0.525 : 0.75,
        descent: size === "script" ? 0.175 : 0.25,
        error: null,
      } satisfies TexBox);

const twoObjects = (opts: Partial<EdgeOptions> = {}, label = "f") => {
  let d: Diagram = emptyDiagram(100);
  const a = addVertex(d, 0, 0, "A");
  if (!a.ok) throw 0;
  d = a.value.diagram;
  const b = addVertex(d, 1, 0, "B");
  if (!b.ok) throw 0;
  d = b.value.diagram;
  const e = addEdge(d, a.value.id, b.value.id, label, opts);
  if (!e.ok) throw 0;
  return { d: e.value.diagram, a: a.value.id, b: b.value.id, e: e.value.id };
};

const edgeLayout = (d: Diagram, id: string) => layoutDiagram(d, DEFAULT_STYLE, fakeTypeset).byId.get(id) as EdgeLayout;

describe("layout", () => {
  test("arrows stop short of their endpoints' labels", () => {
    const { d, e } = twoObjects();
    const l = edgeLayout(d, e);
    const layout = layoutDiagram(d, DEFAULT_STYLE, fakeTypeset);
    const [va, vb] = layout.cells;
    expect(l.curve).not.toBeNull();
    for (const v of [va!, vb!]) {
      if (v.kind !== "vertex") throw 0;
      expect(inBox(v.label!.box, l.curve![0])).toBe(false);
      expect(inBox(v.label!.box, l.curve![3])).toBe(false);
    }
  });

  test("labels sit on the requested side (left of a rightward arrow is above it)", () => {
    const left = edgeLayout(twoObjects({ labelSide: "left" }).d, "c3");
    const right = edgeLayout(twoObjects({ labelSide: "right" }).d, "c3");
    const centre = edgeLayout(twoObjects({ labelSide: "centre" }).d, "c3");
    expect(left.label!.box.cy).toBeLessThan(0);
    expect(right.label!.box.cy).toBeGreaterThan(0);
    close(centre.label!.box.cy, 0, 1e-6);
  });

  test("a centred label breaks the shaft in two", () => {
    const over = edgeLayout(twoObjects({ labelSide: "over", head: "none" }).d, "c3");
    const centre = edgeLayout(twoObjects({ labelSide: "centre", head: "none" }).d, "c3");
    expect(over.strokes.length).toBe(1);
    expect(centre.strokes.length).toBe(2);
  });

  test("stroke counts reflect lines, heads and tails", () => {
    const strokes = (o: Partial<EdgeOptions>) => edgeLayout(twoObjects(o, "").d, "c3").strokes.length;
    expect(strokes({})).toBe(2); // shaft + head
    expect(strokes({ lines: 2 })).toBe(3);
    expect(strokes({ lines: 3, head: "epi" })).toBe(5);
    expect(strokes({ tail: "mono" })).toBe(3);
    expect(strokes({ body: "none", head: "none" })).toBe(0);
    expect(strokes({ style: "adjunction" })).toBe(2);
    expect(strokes({ style: "pullback" })).toBe(1);
  });

  test("a 2-cell attaches near the middles of its arrows", () => {
    // Rightward arrows: negative curve bends up (toward "left"), positive down.
    let { d, a, b, e: f } = twoObjects({ curve: -3 });
    const g = addEdge(d, a, b, "g", { curve: 3 });
    if (!g.ok) throw 0;
    d = g.value.diagram;
    const alpha = addEdge(d, f, g.value.id, "\\alpha", { lines: 2 });
    if (!alpha.ok) throw 0;
    d = alpha.value.diagram;
    const layout = layoutDiagram(d, DEFAULT_STYLE, fakeTypeset);
    const fl = layout.byId.get(f) as EdgeLayout;
    const al = layout.byId.get(alpha.value.id) as EdgeLayout;
    expect(al.curve).not.toBeNull();
    // Starts at the anchor clearance around f's midpoint, pointing downward toward g.
    close(dist(al.curve![0], fl.anchor), DEFAULT_STYLE.anchorRadius, 0.05);
    expect(al.curve![3].y).toBeGreaterThan(al.curve![0].y);
  });

  test("frame: left/right and positive curve/offset are read on screen, whichever way an arrow points", () => {
    // Objects at the centre and one cell away in each direction; one arrow out to each.
    let d: Diagram = emptyDiagram(100);
    const ids: Record<string, string> = {};
    const spots = [
      ["o", 0, 0],
      ["up", 0, -1],
      ["down", 0, 1],
      ["left", -1, 0],
      ["right", 1, 0],
      ["downRight", 1, 1],
      ["upRight", 1, -1],
    ] as const;
    for (const [name, col, row] of spots) {
      const v = addVertex(d, col, row, name.toUpperCase());
      if (!v.ok) throw 0;
      d = v.value.diagram;
      ids[name] = v.value.id;
    }
    const layoutWith = (to: string, o: Partial<EdgeOptions>, reversed = false) => {
      const e = reversed ? addEdge(d, ids[to]!, ids.o!, "f", o) : addEdge(d, ids.o!, ids[to]!, "f", o);
      if (!e.ok) throw 0;
      return edgeLayout(e.value.diagram, e.value.id);
    };
    const mid = (l: EdgeLayout) => l.anchor;

    for (const reversed of [false, true]) {
      // Vertical arrows (up or down): "left" is screen-left; positive curve/offset go screen-right.
      for (const dir of ["up", "down"]) {
        expect(layoutWith(dir, { labelSide: "left" }, reversed).label!.box.cx).toBeLessThan(0);
        expect(layoutWith(dir, { labelSide: "right" }, reversed).label!.box.cx).toBeGreaterThan(0);
        expect(mid(layoutWith(dir, { curve: 2 }, reversed)).x).toBeGreaterThan(5);
        expect(mid(layoutWith(dir, { curve: -2 }, reversed)).x).toBeLessThan(-5);
        close(mid(layoutWith(dir, { offset: 1 }, reversed)).x, DEFAULT_STYLE.offsetUnit, 1e-6);
      }
      // Horizontal arrows (left or right): "left" is above; positive curve/offset go down.
      for (const dir of ["left", "right"]) {
        expect(layoutWith(dir, { labelSide: "left" }, reversed).label!.box.cy).toBeLessThan(0);
        expect(layoutWith(dir, { labelSide: "right" }, reversed).label!.box.cy).toBeGreaterThan(0);
        expect(mid(layoutWith(dir, { curve: 2 }, reversed)).y).toBeGreaterThan(5);
        close(mid(layoutWith(dir, { offset: -1 }, reversed)).y, -DEFAULT_STYLE.offsetUnit, 1e-6);
      }
      // Exact diagonals count as vertical: "left" is lower-left of "\\" and upper-left of "/".
      const side = (dir: string, labelSide: "left" | "right") => {
        const l = layoutWith(dir, { labelSide }, reversed);
        return { dx: Math.sign(l.label!.box.cx - l.anchor.x), dy: Math.sign(l.label!.box.cy - l.anchor.y) };
      };
      expect(side("downRight", "left")).toEqual({ dx: -1, dy: 1 });
      expect(side("downRight", "right")).toEqual({ dx: 1, dy: -1 });
      expect(side("upRight", "left")).toEqual({ dx: -1, dy: -1 });
      expect(side("upRight", "right")).toEqual({ dx: 1, dy: 1 });
      // The layout reports that side for UI previews.
      const frame = layoutWith("downRight", {}, reversed).frame!;
      expect([Math.sign(frame.left.x), Math.sign(frame.left.y)]).toEqual([-1, 1]);
    }
  });

  test("loops leave and re-enter their vertex", () => {
    let d: Diagram = emptyDiagram(100);
    const a = addVertex(d, 0, 0, "A");
    if (!a.ok) throw 0;
    d = a.value.diagram;
    const loop = addEdge(d, a.value.id, a.value.id, "", { loopAngle: 270 });
    if (!loop.ok) throw 0;
    const l = edgeLayout(loop.value.diagram, loop.value.id);
    expect(l.curve).not.toBeNull();
    // Pointing up: the loop's far point is above the vertex.
    expect(l.anchor.y).toBeLessThan(-30);
  });

  test("bounds cover every drawn label", () => {
    const { d } = twoObjects({ labelSide: "left" });
    const layout = layoutDiagram(d, DEFAULT_STYLE, fakeTypeset);
    const label = (layout.byId.get("c3") as EdgeLayout).label!.box;
    expect(layout.bounds.minY).toBeLessThanOrEqual(label.cy - label.hh);
  });
});
