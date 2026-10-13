/**
 * Top bar: history, grid spacing, view, share link, export and help.
 */
import { useState } from "react";
import { emptyDiagram, setCellSize } from "../model/diagram";
import { CELL_SIZE_RANGE } from "../model/types";
import { EXPORT_FORMATS, RASTER_SCALES, type ExportFormat } from "../render/export";
import type { Editor } from "./useEditor";

export interface ExportSettings {
  readonly format: ExportFormat;
  readonly scale: number;
  readonly background: "transparent" | "white";
  readonly ink: string;
}

interface ToolbarProps {
  readonly editor: Editor;
  readonly zoom: number;
  readonly onCenter: () => void;
  readonly onShare: () => void;
  readonly exportSettings: ExportSettings;
  readonly setExportSettings: (s: ExportSettings) => void;
  readonly onExport: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl+";
const ALT = isMac ? "⌥" : "Alt+";

const HELP: [string, string][] = [
  ["Double-click grid", "New object"],
  ["Drag from object/arrow", "New arrow (release on empty grid to create its target, or on the same object for a loop)"],
  ["Drag between arrows", "2-cell (arrow between arrows)"],
  [`${ALT}drag`, "Move objects"],
  ["Drag empty space", "Box select (⇧ to add)"],
  ["Click / ⇧-click", "Select / toggle selection"],
  ["Double-click / Enter", "Edit label"],
  ["Arrow keys", "Nudge selected objects"],
  ["⌫ / Delete", "Delete selection"],
  [`${MOD}Z / ${MOD}⇧Z`, "Undo / redo"],
  [`${MOD}A`, "Select all"],
  ["Scroll · space-drag · middle-drag", "Pan"],
  [`Pinch · ${MOD}scroll`, "Zoom"],
];

export const Toolbar = ({ editor, zoom, onCenter, onShare, exportSettings, setExportSettings, onExport }: ToolbarProps) => {
  const [helpOpen, setHelpOpen] = useState(false);
  const { diagram } = editor;
  const set = (patch: Partial<ExportSettings>) => setExportSettings({ ...exportSettings, ...patch });
  const raster = exportSettings.format !== "svg";

  return (
    <header className="toolbar">
      <span className="brand">cat-builder</span>

      <div className="group">
        <button type="button" onClick={editor.undo} disabled={!editor.canUndo} title={`Undo (${MOD}Z)`}>
          Undo
        </button>
        <button type="button" onClick={editor.redo} disabled={!editor.canRedo} title={`Redo (${MOD}⇧Z)`}>
          Redo
        </button>
      </div>

      <label className="group" title="Distance between grid points">
        <span className="muted">Spacing</span>
        <input
          type="range"
          min={CELL_SIZE_RANGE.min}
          max={CELL_SIZE_RANGE.max}
          step={10}
          value={diagram.cellSize}
          onChange={e => editor.commit(setCellSize(diagram, Number(e.target.value)), "cellSize")}
          onPointerUp={() => editor.seal()}
        />
      </label>

      <div className="group">
        <button type="button" onClick={onCenter} title="Centre the diagram and reset the zoom">
          {Math.round(zoom * 100)}%
        </button>
      </div>

      <div className="spacer" />

      <div className="group">
        <button type="button" onClick={onShare} title="Copy a link that opens this diagram">
          Share link
        </button>
      </div>

      <div className="group export">
        <select value={exportSettings.format} onChange={e => set({ format: e.target.value as ExportFormat })} aria-label="Format">
          {EXPORT_FORMATS.map(f => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
        {raster && (
          <select value={exportSettings.scale} onChange={e => set({ scale: Number(e.target.value) })} aria-label="Scale">
            {RASTER_SCALES.map(s => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        )}
        <select
          value={exportSettings.background}
          onChange={e => set({ background: e.target.value as ExportSettings["background"] })}
          aria-label="Background"
        >
          <option value="transparent">Transparent</option>
          <option value="white">White</option>
        </select>
        <input type="color" value={exportSettings.ink} onChange={e => set({ ink: e.target.value })} title="Ink colour" />
        <button type="button" className="primary" onClick={onExport}>
          Export
        </button>
      </div>

      <div className="group">
        <button
          type="button"
          onClick={() => {
            if (diagram.cells.length > 0 && confirm("Clear the whole diagram? (You can undo this.)")) {
              editor.commit(emptyDiagram(diagram.cellSize), null, []);
            }
          }}
          title="Start over"
        >
          Clear
        </button>
        <button type="button" onClick={() => setHelpOpen(o => !o)} aria-expanded={helpOpen} title="Gestures and shortcuts">
          ?
        </button>
      </div>

      {helpOpen && (
        <div className="help" role="dialog" aria-label="Gestures and shortcuts">
          <table>
            <tbody>
              {HELP.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            Labels are TeX (typeset with MathJax). Your work autosaves in this browser; use <em>Share link</em> to send it
            elsewhere.
          </p>
        </div>
      )}
    </header>
  );
};
