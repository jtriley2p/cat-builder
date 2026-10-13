import { describe, expect, test } from "bun:test";
import { decodeJson, decodeLinkHash, encodeJson, encodeLinkHash, fromCompact, toCompact } from "./codec";
import { addEdge, addVertex, emptyDiagram } from "./diagram";
import type { Diagram } from "./types";

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
  });
});
