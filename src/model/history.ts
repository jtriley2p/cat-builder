/**
 * Undo/redo history over immutable snapshots.
 *
 * Consecutive commits sharing a `coalesce` key replace the newest snapshot
 * instead of pushing a new one. This turns e.g. a run of keystrokes in one
 * label, or the many intermediate positions of a drag, into a single undo step.
 */

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** Key of the most recent commit, if it may be coalesced with the next one. */
  readonly coalesceKey: string | null;
}

/** Oldest snapshots are dropped beyond this depth. */
const MAX_DEPTH = 200;

export const initHistory = <T>(present: T, past: readonly T[] = []): History<T> => ({
  past,
  present,
  future: [],
  coalesceKey: null,
});

export const commit = <T>(h: History<T>, next: T, coalesceKey: string | null = null): History<T> => {
  if (next === h.present) return h;
  if (coalesceKey !== null && coalesceKey === h.coalesceKey) {
    return { ...h, present: next, future: [], coalesceKey };
  }
  return {
    past: [...h.past, h.present].slice(-MAX_DEPTH),
    present: next,
    future: [],
    coalesceKey,
  };
};

/** End any coalescing run, so the next commit starts a fresh undo step. */
export const seal = <T>(h: History<T>): History<T> => (h.coalesceKey === null ? h : { ...h, coalesceKey: null });

export const undo = <T>(h: History<T>): History<T> => {
  const prev = h.past.at(-1);
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], coalesceKey: null };
};

export const redo = <T>(h: History<T>): History<T> => {
  const [next, ...rest] = h.future;
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: rest, coalesceKey: null };
};
