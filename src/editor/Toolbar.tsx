/**
 * Top bar: history, grid spacing, view, colours, share link, export and help.
 */
import { emptyDiagram, setCellSize } from "../model/diagram";
import { CELL_SIZE_RANGE } from "../model/types";
import { ColorsMenu } from "./ColorsMenu";
import { ExportMenu } from "./ExportMenu";
import type { ExportSettings } from "./exportSettings";
import { usePopover } from "./usePopover";
import type { Editor } from "./useEditor";

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
  ["Click an empty square twice", "New object (a double-click works too)"],
  ["Drag from object/arrow", "New arrow (release on an empty square to create its target, or on the same object for a loop)"],
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
  const help = usePopover();
  const { diagram } = editor;

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

      <label className="group spacing" title="Size of the grid squares">
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
        <ColorsMenu editor={editor} />
      </div>

      <div className="group">
        <button type="button" onClick={onShare} title="Copy a link that opens this diagram">
          Share link
        </button>
      </div>

      <div className="group">
        <ExportMenu editor={editor} settings={exportSettings} setSettings={setExportSettings} onExport={onExport} />
      </div>

      <div className="group">
        <button
          type="button"
          onClick={() => {
            if (diagram.cells.length > 0 && confirm("Clear the whole diagram? (You can undo this.)")) {
              editor.commit(emptyDiagram(diagram.cellSize, diagram.colors), null, []);
            }
          }}
          title="Start over"
        >
          Clear
        </button>
        <div className="popover-anchor" ref={help.ref}>
          <button type="button" onClick={help.toggle} aria-expanded={help.open} title="Gestures and shortcuts">
            ?
          </button>
          {help.open && <Help />}
        </div>
      </div>
    </header>
  );
};

/** Gesture and shortcut reference. */
const Help = () => (
  <div className="popover help" role="dialog" aria-label="Gestures and shortcuts">
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
);
