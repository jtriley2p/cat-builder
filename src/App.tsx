/**
 * Application shell: wires the editor state to the canvas, inspector and
 * toolbar, and owns the browser-facing concerns — autosave, share links,
 * keyboard shortcuts, export and notifications.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas, type View } from "./editor/Canvas";
import { Inspector } from "./editor/Inspector";
import { clearHash, describeStorageError, loadAutosave, readSharedDiagram, saveAutosave, shareUrl } from "./editor/persistence";
import { loadExportSettings, saveExportSettings, type ExportSettings } from "./editor/exportSettings";
import { Toolbar } from "./editor/Toolbar";
import { useEditor, type Editor } from "./editor/useEditor";
import { isEmptyBounds } from "./geometry/vec";
import { describeDecodeError } from "./model/codec";
import { emptyDiagram, moveVertices, removeCells } from "./model/diagram";
import type { Diagram } from "./model/types";
import { describeExportError, downloadBlob, exportImage } from "./render/export";
import "./index.css";

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly kind: "info" | "error";
}

const TOAST_MS = 4500;

/**
 * Initial on-screen zoom. 100% is the size of a 1× export, which is a little
 * small for comfortable editing.
 */
const DEFAULT_ZOOM = 1.5;

const useToasts = () => {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextId = useRef(0);
  const show = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = ++nextId.current;
    setToasts(ts => [...ts, { id, message, kind }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), TOAST_MS);
  }, []);
  return [toasts, show] as const;
};

/** The autosaved diagram (or an empty one), plus a message if restoring failed. */
const restore = (): { diagram: Diagram; problem: string | null } => {
  const r = loadAutosave();
  if (r.ok) return { diagram: r.value ?? emptyDiagram(), problem: null };
  const problem =
    typeof r.error === "string"
      ? describeStorageError(r.error)
      : `Couldn't restore your autosaved diagram. ${describeDecodeError(r.error)}`;
  return { diagram: emptyDiagram(), problem };
};

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function App() {
  const [initial] = useState(restore);
  const editor = useEditor(initial.diagram);
  const [toasts, toast] = useToasts();
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [panMode, setPanMode] = useState(false);
  const [exportSettings, setExportSettings] = useState(loadExportSettings);
  const [centerRequest, setCenterRequest] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  const focusLabel = useCallback(
    () =>
      requestAnimationFrame(() => {
        labelRef.current?.focus();
        labelRef.current?.select();
      }),
    [],
  );

  // --- View -----------------------------------------------------------------

  /** Reset zoom and put the diagram's centre (or the origin) in the middle of the canvas. */
  const center = useCallback(() => {
    const zoom = DEFAULT_ZOOM;
    const el = svgRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const b = editor.layout.bounds;
    const cx = isEmptyBounds(b) ? 0 : (b.minX + b.maxX) / 2;
    const cy = isEmptyBounds(b) ? 0 : (b.minY + b.maxY) / 2;
    setView({ zoom, x: width / 2 - cx * zoom, y: height / 2 - cy * zoom });
  }, [editor.layout]);

  // Centre on first paint, and whenever a new diagram is opened.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(center, [centerRequest]);

  // --- Persistence ----------------------------------------------------------

  useEffect(() => {
    if (initial.problem) toast(initial.problem, "error");
  }, [initial, toast]);

  const autosaveWarned = useRef(false);
  useEffect(() => {
    const r = saveAutosave(editor.diagram);
    if (!r.ok && !autosaveWarned.current) {
      autosaveWarned.current = true;
      toast(describeStorageError(r.error), "error");
    }
  }, [editor.diagram, toast]);

  // Open a diagram from a share link, on load and if a link is pasted into this tab.
  const editorRef = useRef<Editor>(editor);
  editorRef.current = editor;
  useEffect(() => {
    let cancelled = false;
    const openShared = async () => {
      const r = await readSharedDiagram();
      if (cancelled || r === null) return;
      clearHash();
      if (!r.ok) {
        toast(`Couldn't open the shared link. ${describeDecodeError(r.error)}`, "error");
        return;
      }
      const hadWork = editorRef.current.diagram.cells.length > 0;
      editorRef.current.open(r.value);
      setCenterRequest(n => n + 1);
      toast(hadWork ? "Opened the shared diagram. Undo to get your previous one back." : "Opened the shared diagram.");
    };
    void openShared();
    window.addEventListener("hashchange", openShared);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", openShared);
    };
  }, [toast]);

  const onShare = async () => {
    if (editor.diagram.cells.length === 0) {
      toast("Nothing to share yet: the diagram is empty.", "error");
      return;
    }
    const url = await shareUrl(editor.diagram);
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied to the clipboard.");
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  // --- Export ---------------------------------------------------------------

  const updateExportSettings = (s: ExportSettings) => {
    setExportSettings(s);
    saveExportSettings(s);
  };

  const onExport = async () => {
    const r = await exportImage(editor.layout, editor.style, { ...exportSettings, colors: editor.diagram.colors });
    if (!r.ok) {
      toast(describeExportError(r.error), "error");
      return;
    }
    downloadBlob(r.value);
    const broken = editor.layout.cells.filter(c => c.label?.tex.error).length;
    if (broken > 0) {
      toast(`${broken} label${broken === 1 ? " has a TeX error" : "s have TeX errors"} (exported as a red “?”).`, "error");
    }
  };

  // --- Keyboard -------------------------------------------------------------

  useEffect(() => {
    const NUDGE: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const ed = editorRef.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const onButton = e.target instanceof HTMLButtonElement;

      if (key === " " && !onButton) {
        e.preventDefault();
        setPanMode(true);
      } else if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else ed.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        ed.redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        ed.select(ed.diagram.cells.map(c => c.id));
      } else if ((key === "backspace" || key === "delete") && ed.selection.size > 0) {
        e.preventDefault();
        ed.commit(removeCells(ed.diagram, ed.selection));
      } else if (key === "escape") {
        ed.select([]);
      } else if (key === "enter" && !onButton && ed.selection.size === 1) {
        e.preventDefault();
        focusLabel();
      } else if (e.key in NUDGE && ed.selection.size > 0) {
        e.preventDefault();
        const [dc, dr] = NUDGE[e.key]!;
        const moved = moveVertices(ed.diagram, ed.selection, dc, dr);
        if (moved.ok) ed.commit(moved.value);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setPanMode(false);
    };
    const onBlur = () => setPanMode(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [focusLabel]);

  // --- Layout ---------------------------------------------------------------

  return (
    <div className="app">
      <Toolbar
        editor={editor}
        zoom={view.zoom}
        onCenter={center}
        onShare={onShare}
        exportSettings={exportSettings}
        setExportSettings={updateExportSettings}
        onExport={onExport}
      />
      <main className="workspace">
        <Canvas
          editor={editor}
          view={view}
          setView={setView}
          panMode={panMode}
          onCreated={focusLabel}
          onEditLabel={focusLabel}
          onError={msg => toast(msg, "error")}
          svgRef={svgRef}
        />
        {editor.diagram.cells.length === 0 && (
          <p className="empty-hint">Click an empty square twice to add an object, then drag from it to draw an arrow.</p>
        )}
        <Inspector editor={editor} labelRef={labelRef} />
        <div className="toasts" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id} className={`toast ${t.kind}`}>
              {t.message}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
