/**
 * The interactive drawing surface.
 *
 * Gestures (see also the help panel in Toolbar.tsx):
 * - double-click empty grid: new object; double-click a cell: edit its label
 * - drag from an object or arrow: new arrow to whatever it is released over
 *   (an empty grid point gets a new object; the same object makes a loop)
 * - ⌥/Alt-drag: move objects (the whole selection if the grabbed one is selected)
 * - drag empty space: box-select (⇧ adds to the selection)
 * - scroll / middle-drag / space-drag: pan; pinch or ⌘/Ctrl-scroll: zoom
 *
 * Hit-testing is geometric (see hit.ts) rather than via DOM events, so the
 * diagram layer can be plain injected SVG markup.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CellLayout } from "../geometry/layout";
import { dist, vec, type Vec } from "../geometry/vec";
import { addEdge, addVertex, moveVertices, vertexAt } from "../model/diagram";
import { DEFAULT_VERTEX_LABEL, type CellId, type Diagram } from "../model/types";
import { cubicPath } from "../geometry/bezier";
import { cellMarkup } from "../render/svg";
import { cellsInRect, hitTest, type Hit } from "./hit";
import type { Editor } from "./useEditor";

export interface View {
  /** Screen position (px) of the diagram origin. */
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const ZOOM_RANGE = { min: 0.25, max: 4 } as const;

interface CanvasProps {
  readonly editor: Editor;
  readonly view: View;
  readonly setView: (f: (v: View) => View) => void;
  /** Space is held: plain drags pan. */
  readonly panMode: boolean;
  /** A cell was just created and selected: its label should be edited. */
  readonly onCreated: () => void;
  /** The user asked to edit the selected cell's label (double-click). */
  readonly onEditLabel: () => void;
  readonly onError: (message: string) => void;
  readonly svgRef: React.RefObject<SVGSVGElement | null>;
}

type Drag =
  | {
      readonly kind: "connect";
      readonly source: CellId;
      readonly originScreen: Vec;
      readonly pointer: Vec;
      readonly active: boolean;
      readonly toggle: boolean;
    }
  | {
      readonly kind: "move";
      readonly ids: readonly CellId[];
      readonly start: Vec;
      readonly base: Diagram;
      readonly delta: readonly [number, number];
      readonly key: string;
    }
  | {
      readonly kind: "marquee";
      readonly originScreen: Vec;
      readonly start: Vec;
      readonly current: Vec;
      readonly active: boolean;
      readonly additive: boolean;
    }
  | { readonly kind: "pan"; readonly originScreen: Vec; readonly startView: View };

/** Pointer travel (screen px) before a press turns into a drag. */
const DRAG_THRESHOLD = 4;
/** Hit tolerance around arrows, in screen px. */
const HIT_TOLERANCE = 6;

let dragCounter = 0;

export const Canvas = ({ editor, view, setView, panMode, onCreated, onEditLabel, onError, svgRef }: CanvasProps) => {
  const { diagram, layout, style, selection } = editor;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Hit | null>(null);
  const cs = diagram.cellSize;

  const markup = useMemo(() => new Map(layout.cells.map(c => [c.id, cellMarkup(c, style)])), [layout, style]);

  const screenOf = (e: { clientX: number; clientY: number }): Vec => {
    const r = svgRef.current!.getBoundingClientRect();
    return vec(e.clientX - r.left, e.clientY - r.top);
  };
  const worldOf = (s: Vec): Vec => vec((s.x - view.x) / view.zoom, (s.y - view.y) / view.zoom);
  const tolerance = HIT_TOLERANCE / view.zoom;
  const gridPoint = (p: Vec) => ({ col: Math.round(p.x / cs), row: Math.round(p.y / cs) });

  // Wheel: pan, or zoom around the cursor with pinch / ⌘ / Ctrl. Registered
  // manually because React's wheel listeners are passive (can't preventDefault).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const s = vec(e.clientX - r.left, e.clientY - r.top);
      if (e.ctrlKey || e.metaKey) {
        setView(v => {
          const zoom = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, v.zoom * Math.exp(-e.deltaY * 0.01)));
          const k = zoom / v.zoom;
          return { zoom, x: s.x - (s.x - v.x) * k, y: s.y - (s.y - v.y) * k };
        });
      } else {
        setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [svgRef, setView]);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = screenOf(e);
    const p = worldOf(s);
    if (e.button === 1 || (e.button === 0 && panMode)) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ kind: "pan", originScreen: s, startView: view });
      return;
    }
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const hit = hitTest(layout, p, tolerance);

    if (hit && e.altKey) {
      // Move the selection if the grabbed cell is part of it, else just this vertex.
      const group = selection.has(hit.id) ? [...selection] : [hit.id];
      const ids = group.filter(id => layout.byId.get(id)?.kind === "vertex");
      if (ids.length === 0) return;
      if (!selection.has(hit.id)) editor.select([hit.id]);
      editor.seal();
      setDrag({ kind: "move", ids, start: p, base: diagram, delta: [0, 0], key: `move:${++dragCounter}` });
    } else if (hit) {
      setDrag({ kind: "connect", source: hit.id, originScreen: s, pointer: p, active: false, toggle: e.shiftKey });
    } else {
      setDrag({ kind: "marquee", originScreen: s, start: p, current: p, active: false, additive: e.shiftKey });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = screenOf(e);
    const p = worldOf(s);
    if (!drag) {
      setHover(hitTest(layout, p, tolerance));
      return;
    }
    switch (drag.kind) {
      case "pan":
        setView(v => ({ ...v, x: drag.startView.x + s.x - drag.originScreen.x, y: drag.startView.y + s.y - drag.originScreen.y }));
        return;
      case "connect": {
        const active = drag.active || dist(s, drag.originScreen) > DRAG_THRESHOLD;
        setDrag({ ...drag, pointer: p, active });
        setHover(active ? hitTest(layout, p, tolerance) : null);
        return;
      }
      case "marquee":
        setDrag({ ...drag, current: p, active: drag.active || dist(s, drag.originScreen) > DRAG_THRESHOLD });
        return;
      case "move": {
        const dc = Math.round((p.x - drag.start.x) / cs);
        const dr = Math.round((p.y - drag.start.y) / cs);
        if (dc === drag.delta[0] && dr === drag.delta[1]) return;
        const moved = moveVertices(drag.base, drag.ids, dc, dr);
        // Blocked by another object: stay at the last valid position.
        if (!moved.ok) return;
        editor.commit(moved.value, drag.key);
        setDrag({ ...drag, delta: [dc, dr] });
        return;
      }
    }
  };

  const finishConnect = (source: CellId, p: Vec) => {
    const target = hitTest(layout, p, tolerance);
    let d = diagram;
    let targetId: CellId;
    if (target) {
      targetId = target.id;
    } else {
      const { col, row } = gridPoint(p);
      const existing = vertexAt(d, col, row);
      if (existing) {
        targetId = existing.id;
      } else {
        const created = addVertex(d, col, row, DEFAULT_VERTEX_LABEL);
        if (!created.ok) return;
        d = created.value.diagram;
        targetId = created.value.id;
      }
    }
    const added = addEdge(d, source, targetId);
    if (!added.ok) {
      if (added.error === "edge-loop") onError("An arrow can't start and end on the same arrow.");
      return;
    }
    editor.commit(added.value.diagram, null, [added.value.id]);
    onCreated();
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    const p = worldOf(screenOf(e));
    switch (d.kind) {
      case "connect":
        if (d.active) finishConnect(d.source, p);
        else if (d.toggle) editor.select(toggled(selection, d.source));
        else editor.select([d.source]);
        return;
      case "marquee": {
        const inRect = d.active ? cellsInRect(layout, d.start, d.current) : [];
        editor.select(d.additive ? [...selection, ...inRect] : inRect);
        return;
      }
      case "move":
        editor.seal();
        return;
      case "pan":
        return;
    }
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = worldOf(screenOf(e));
    const hit = hitTest(layout, p, tolerance);
    if (hit) {
      editor.select([hit.id]);
      onEditLabel();
      return;
    }
    const { col, row } = gridPoint(p);
    const created = addVertex(diagram, col, row, DEFAULT_VERTEX_LABEL);
    if (!created.ok) return;
    editor.commit(created.value.diagram, null, [created.value.id]);
    onCreated();
  };

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  const grid = cs * view.zoom;
  const cursor =
    drag?.kind === "pan" ? "grabbing" : panMode ? "grab" : drag?.kind === "connect" && drag.active ? "crosshair" : hover ? "pointer" : "default";

  const connectTarget = drag?.kind === "connect" && drag.active ? hover : null;

  return (
    <svg
      ref={svgRef}
      className="canvas"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => !drag && setHover(null)}
      onDoubleClick={onDoubleClick}
    >
      <defs>
        <pattern id="grid" width={grid} height={grid} x={view.x - grid / 2} y={view.y - grid / 2} patternUnits="userSpaceOnUse">
          <circle cx={grid / 2} cy={grid / 2} r={1.25} className="grid-dot" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {layout.cells.map(c =>
          selection.has(c.id) ? (
            <Highlight key={c.id} cell={c} className="hl-selected" />
          ) : hover?.id === c.id || connectTarget?.id === c.id ? (
            <Highlight key={c.id} cell={c} className="hl-hover" />
          ) : null,
        )}
        <g
          className="diagram"
          fill="none"
          stroke="currentColor"
          strokeWidth={style.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {layout.cells.map(c => (
            <g key={c.id} dangerouslySetInnerHTML={{ __html: markup.get(c.id) ?? "" }} />
          ))}
        </g>
        {layout.cells.map(c =>
          c.kind === "vertex" && !c.label ? (
            <circle key={c.id} className="point-marker" cx={c.center.x} cy={c.center.y} r={3} vectorEffect="non-scaling-stroke" />
          ) : null,
        )}
        {drag?.kind === "connect" && drag.active && (
          <ConnectPreview from={anchorOf(layout.byId.get(drag.source))} to={connectTarget ? anchorOf(layout.byId.get(connectTarget.id)) : drag.pointer} />
        )}
        {drag?.kind === "marquee" && drag.active && (
          <rect
            className="marquee"
            x={Math.min(drag.start.x, drag.current.x)}
            y={Math.min(drag.start.y, drag.current.y)}
            width={Math.abs(drag.current.x - drag.start.x)}
            height={Math.abs(drag.current.y - drag.start.y)}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </g>
    </svg>
  );
};

const toggled = (set: ReadonlySet<CellId>, id: CellId): CellId[] =>
  set.has(id) ? [...set].filter(x => x !== id) : [...set, id];

const anchorOf = (c: CellLayout | undefined): Vec => (!c ? vec(0, 0) : c.kind === "vertex" ? c.center : c.anchor);

const ConnectPreview = ({ from, to }: { from: Vec; to: Vec }) => (
  <line className="connect-preview" x1={from.x} y1={from.y} x2={to.x} y2={to.y} vectorEffect="non-scaling-stroke" />
);

/** Selection / hover emphasis drawn beneath a cell. */
const Highlight = ({ cell, className }: { cell: CellLayout; className: string }) => {
  if (cell.kind === "vertex") {
    const pad = 4;
    const box = cell.label?.box;
    return box ? (
      <rect
        className={className}
        x={box.cx - box.hw - pad}
        y={box.cy - box.hh - pad}
        width={2 * (box.hw + pad)}
        height={2 * (box.hh + pad)}
        rx={4}
        vectorEffect="non-scaling-stroke"
      />
    ) : (
      <circle className={className} cx={cell.center.x} cy={cell.center.y} r={8} vectorEffect="non-scaling-stroke" />
    );
  }
  const points = cell.hitPath.map(p => `${p.x},${p.y}`).join(" ");
  return (
    <g className={className}>
      {/* The invisible connecting curve of symbol-only edges (⊣, ⌟, ⌜), so it's clear what they join. */}
      {cell.curve && <path className="hl-guide" d={cubicPath(cell.curve)} vectorEffect="non-scaling-stroke" />}
      <polyline className="hl-band" points={points} />
      {cell.label && (
        <rect
          className="hl-label"
          x={cell.label.box.cx - cell.label.box.hw - 3}
          y={cell.label.box.cy - cell.label.box.hh - 3}
          width={2 * cell.label.box.hw + 6}
          height={2 * cell.label.box.hh + 6}
          rx={3}
        />
      )}
    </g>
  );
};
