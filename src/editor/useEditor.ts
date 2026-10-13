/**
 * Editor state: the diagram's undo history, the selection, and the derived
 * layout. Components receive the `Editor` object and call its actions; all
 * diagram changes go through `commit` so they are undoable and autosaved.
 */
import { useCallback, useMemo, useState } from "react";
import { layoutDiagram, type Layout } from "../geometry/layout";
import { DEFAULT_STYLE, type Style } from "../geometry/style";
import { commit as commitHistory, initHistory, redo as redoHistory, seal as sealHistory, undo as undoHistory, type History } from "../model/history";
import type { CellId, Diagram } from "../model/types";
import { typeset } from "../render/tex";

export interface Editor {
  readonly diagram: Diagram;
  readonly layout: Layout;
  readonly style: Style;
  /** Selected cell ids, always restricted to cells that exist. */
  readonly selection: ReadonlySet<CellId>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  select(ids: Iterable<CellId>): void;
  /**
   * Record a new diagram state. Consecutive commits with the same non-null
   * `coalesce` key merge into one undo step (typing, dragging).
   */
  commit(next: Diagram, coalesce?: string | null, select?: Iterable<CellId>): void;
  /** End the current coalescing run. */
  seal(): void;
  undo(): void;
  redo(): void;
  /** Replace the whole diagram (e.g. opening a share link), keeping the old one undoable. */
  open(d: Diagram): void;
}

export const useEditor = (initial: Diagram): Editor => {
  const [history, setHistory] = useState<History<Diagram>>(() => initHistory(initial));
  const [rawSelection, setRawSelection] = useState<ReadonlySet<CellId>>(new Set());
  const diagram = history.present;
  const style = DEFAULT_STYLE;

  const layout = useMemo(() => layoutDiagram(diagram, style, typeset), [diagram, style]);
  const selection = useMemo(
    () => new Set([...rawSelection].filter(id => layout.byId.has(id))) as ReadonlySet<CellId>,
    [rawSelection, layout],
  );

  const select = useCallback((ids: Iterable<CellId>) => setRawSelection(new Set(ids)), []);
  const commit = useCallback((next: Diagram, coalesce: string | null = null, sel?: Iterable<CellId>) => {
    setHistory(h => commitHistory(h, next, coalesce));
    if (sel) setRawSelection(new Set(sel));
  }, []);
  const seal = useCallback(() => setHistory(sealHistory), []);
  const undo = useCallback(() => setHistory(undoHistory), []);
  const redo = useCallback(() => setHistory(redoHistory), []);
  const open = useCallback((d: Diagram) => {
    setHistory(h => commitHistory(sealHistory(h), d));
    setRawSelection(new Set());
  }, []);

  return {
    diagram,
    layout,
    style,
    selection,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    select,
    commit,
    seal,
    undo,
    redo,
    open,
  };
};
