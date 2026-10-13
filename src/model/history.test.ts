import { expect, test } from "bun:test";
import { commit, initHistory, redo, seal, undo } from "./history";

test("undo/redo walk the snapshots", () => {
  let h = initHistory(0);
  h = commit(h, 1);
  h = commit(h, 2);
  h = undo(h);
  expect(h.present).toBe(1);
  h = undo(h);
  expect(h.present).toBe(0);
  expect(undo(h)).toBe(h); // nothing further to undo
  h = redo(h);
  expect(h.present).toBe(1);
});

test("a new commit discards the redo branch", () => {
  let h = commit(commit(initHistory(0), 1), 2);
  h = commit(undo(h), 3);
  expect(h.future).toEqual([]);
  expect(redo(h)).toBe(h);
});

test("commits with the same coalesce key form one undo step until sealed", () => {
  let h = initHistory("");
  h = commit(h, "a", "label");
  h = commit(h, "ab", "label");
  h = commit(h, "abc", "label");
  expect(undo(h).present).toBe("");
  h = commit(seal(h), "abcd", "label");
  expect(undo(h).present).toBe("abc");
});

test("committing the identical value is a no-op", () => {
  const h = commit(initHistory({ n: 1 }), { n: 2 });
  expect(commit(h, h.present)).toBe(h);
});
