import { describe, expect, test } from "bun:test";
import { decodeJson, decodeLinkHash, encodeJson, encodeLinkHash, fromCompact, toCompact } from "./codec";
import { addEdge, addVertex, emptyDiagram, setColors, setFontSize, setStrokeWidth } from "./diagram";
import { DEFAULT_COLORS, FONT_SIZE_RANGE, STROKE_WIDTH_RANGE, type Diagram } from "./types";

const build = (): Diagram => {
  let d = emptyDiagram(120);
  const step = <T extends { diagram: Diagram }>(r: { ok: true; value: T } | { ok: false }) => {
    if (!r.ok) throw new Error("setup failed");
    d = r.value.diagram;
    return r.value;
  };
  const a = step(addVertex(d, 0, 0, "\\mathcal{C}"));
  const b = step(addVertex(d, 2, -1, "\\mathcal{D}"));
  const f = step(addEdge(d, a.id, b.id, "F", { curve: 2 }));
  const g = step(addEdge(d, a.id, b.id, "G", { curve: -2, labelSide: "right" }));
  step(addEdge(d, f.id, g.id, "\\alpha", { lines: 2, labelPos: 0.35 }));
  step(addEdge(d, a.id, a.id, "", { tail: "hook", body: "squiggly", head: "epi", loopAngle: 90 }));
  step(addEdge(d, a.id, b.id, "", { style: "pullback" }));
  return d;
};

/** Compare diagrams by content (ids are regenerated on decode). */
const content = (d: Diagram) => toCompact(d);

describe("codec", () => {
  test("JSON round-trips every feature", () => {
    const d = build();
    const back = decodeJson(encodeJson(d));
    expect(back.ok).toBe(true);
    if (back.ok) expect(content(back.value)).toEqual(content(d));
  });

  test("only non-default options are stored", () => {
    const compact = toCompact(build()) as [number, number, unknown[][]];
    const plainEdge = compact[2][2]!; // F: only `curve` differs from the defaults
    expect(plainEdge[3]).toEqual({ c: 2 });
  });

  test("share links round-trip", async () => {
    const d = build();
    const hash = await encodeLinkHash(d);
    expect(hash.startsWith("#d=")).toBe(true);
    expect(hash).toMatch(/^#d=[A-Za-z0-9_-]+$/);
    const back = await decodeLinkHash(hash);
    expect(back.ok).toBe(true);
    if (back.ok) expect(content(back.value)).toEqual(content(d));
  });

  test("colours round-trip, and default colours are left out", async () => {
    const plain = build();
    expect(toCompact(plain).length).toBe(3);

    const colored = setColors(plain, {
      stroke: { color: "#aa0000", alpha: 0.6 },
      background: { color: "#224466", alpha: 0 },
    });
    const compact = toCompact(colored);
    expect(compact[3]).toEqual({ s: ["#aa0000", 0.6], b: ["#224466", 0] });

    const viaJson = decodeJson(encodeJson(colored));
    expect(viaJson.ok && viaJson.value.colors).toEqual(colored.colors);
    const viaLink = await decodeLinkHash(await encodeLinkHash(colored));
    expect(viaLink.ok && viaLink.value.colors).toEqual(colored.colors);

    // Only the changed colour is stored.
    const strokeOnly = setColors(plain, { stroke: { color: "#123456", alpha: 1 } });
    expect(toCompact(strokeOnly)[3]).toEqual({ s: ["#123456", 1] });
  });

  test("data from before colours existed decodes with the defaults", () => {
    const r = fromCompact([1, 100, [[0, 0, "A"]]]);
    expect(r.ok && r.value.colors).toEqual(DEFAULT_COLORS);
  });

  test("sizes round-trip next to the colours, and default sizes are left out", async () => {
    const sized = setStrokeWidth(setFontSize(build(), 26), 2.4);
    expect(toCompact(sized)[3]).toEqual({ f: 26, w: 2.4 });
    const colored = setColors(sized, { stroke: { color: "#123456", alpha: 1 } });
    expect(toCompact(colored)[3]).toEqual({ s: ["#123456", 1], f: 26, w: 2.4 });

    const viaLink = await decodeLinkHash(await encodeLinkHash(colored));
    expect(viaLink.ok && [viaLink.value.fontSize, viaLink.value.strokeWidth]).toEqual([26, 2.4]);
    expect(viaLink.ok && content(viaLink.value)).toEqual(content(colored));
  });

  test("data from before sizes existed decodes with the default sizes", () => {
    const r = fromCompact([1, 100, [[0, 0, "A"]], { s: ["#aa0000", 1] }]);
    expect(r.ok && [r.value.fontSize, r.value.strokeWidth]).toEqual([FONT_SIZE_RANGE.default, STROKE_WIDTH_RANGE.default]);
  });

  test("damaged links are reported, not thrown", async () => {
    expect(await decodeLinkHash("#d=!!!")).toEqual({ ok: false, error: { kind: "malformed-link" } });
    expect(await decodeLinkHash("#d=AAAA")).toEqual({ ok: false, error: { kind: "malformed-link" } });
  });

  test("structural problems are enumerated", () => {
    expect(decodeJson("{")).toEqual({ ok: false, error: { kind: "invalid-json" } });
    expect(fromCompact([2, 100, []])).toEqual({ ok: false, error: { kind: "unsupported-version", version: 2 } });
    const bad = (raw: unknown) => {
      const r = fromCompact(raw);
      return !r.ok && r.error.kind === "invalid-structure";
    };
    expect(bad([1, 100, [[0, 0, "A"], [0, 0, "B"]]])).toBe(true); // shared grid position
    expect(bad([1, 100, [[0, 1, "", {}]]])).toBe(true); // forward reference
    expect(bad([1, 100, [[0, 0, "A"], [0, 0, "", { s: "wiggle" }]]])).toBe(true); // unknown style
    expect(bad([1, 100, [[0, 0, "A"], [1, 0, "B"], [0, 1, "f", {}], [2, 2, "", {}]]])).toBe(true); // loop on an arrow
    expect(bad([1, 9999, []])).toBe(true); // cell size out of range
    expect(bad([1, 100, [], { s: ["red", 1] }])).toBe(true); // not a hex colour
    expect(bad([1, 100, [], { b: ["#ffffff"] }])).toBe(true); // missing alpha
    expect(bad([1, 100, [], []])).toBe(true); // colours must be an object
    expect(bad([1, 100, [], { f: 500 }])).toBe(true); // font size out of range
    expect(bad([1, 100, [], { w: "thick" }])).toBe(true); // stroke width not a number
  });
});
