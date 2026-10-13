/**
 * The floating tool bar: top right of the canvas, or bottom centre on narrow
 * screens (see index.css). Order: layout, colours, export | undo, redo |
 * clear, info. Every control is an icon button whose `data-tooltip` is shown
 * on hover (a CSS tooltip, so it appears promptly and matches the theme);
 * menus open as popovers.
 */
import { ColorsMenu } from "./ColorsMenu";
import { ExportMenu } from "./ExportMenu";
import type { ExportSettings } from "./exportSettings";
import { InfoIcon, RedoIcon, TrashIcon, UndoIcon } from "./icons";
import { LayoutMenu } from "./LayoutMenu";
import { ALT, MOD } from "./platform";
import { usePopover } from "./usePopover";
import type { Editor } from "./useEditor";

interface ToolbarProps {
  readonly editor: Editor;
  /** Clear the diagram (undoable; App shows a notice). */
  readonly onClear: () => void;
  readonly zoom: number;
  readonly onZoom: (zoom: number) => void;
  readonly onFit: () => void;
  readonly showGrid: boolean;
  readonly onShowGrid: (show: boolean) => void;
  readonly exportSettings: ExportSettings;
  readonly setExportSettings: (s: ExportSettings) => void;
  readonly onExport: () => void;
}

const HELP: [string, string][] = [
  ["Click an empty square twice", "New object (a double-click works too)"],
  ["Drag from object/arrow", "New arrow (release on an empty square to create its target, or on the same object for a loop)"],
  ["Drag between arrows", "2-cell (arrow between arrows)"],
  [`${ALT}drag`, "Move objects"],
  ["Drag empty space", "Box select (⇧ to add)"],
  ["Click / ⇧-click", "Select / toggle selection"],
  ["Double-click / Enter", "Edit label"],
  [`Esc / ${MOD}↩`, "Finish editing the label (Enter adds a line)"],
  ["Arrow keys", "Nudge selected objects"],
  ["⌫ / Delete", "Delete selection"],
  [`${MOD}Z / ${MOD}⇧Z`, "Undo / redo"],
  [`${MOD}A`, "Select all"],
  ["Scroll · space-drag · middle-drag", "Pan"],
  [`Pinch · ${MOD}scroll`, "Zoom"],
];

export const Toolbar = ({
  editor,
  onClear,
  zoom,
  onZoom,
  onFit,
  showGrid,
  onShowGrid,
  exportSettings,
  setExportSettings,
  onExport,
}: ToolbarProps) => {
  const help = usePopover();
  const empty = editor.diagram.cells.length === 0;

  return (
    <header className="toolbar" aria-label="Tools">
      <LayoutMenu editor={editor} zoom={zoom} onZoom={onZoom} onFit={onFit} showGrid={showGrid} onShowGrid={onShowGrid} />
      <ColorsMenu editor={editor} />
      <ExportMenu editor={editor} settings={exportSettings} setSettings={setExportSettings} onExport={onExport} />

      <span className="divider" aria-hidden="true" />

      <button
        type="button"
        className="icon-button"
        onClick={editor.undo}
        disabled={!editor.canUndo}
        aria-label="Undo"
        data-tooltip="Undo"
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={editor.redo}
        disabled={!editor.canRedo}
        aria-label="Redo"
        data-tooltip="Redo"
      >
        <RedoIcon />
      </button>

      <span className="divider" aria-hidden="true" />

      <button
        type="button"
        className="icon-button"
        onClick={onClear}
        disabled={empty}
        aria-label="Clear"
        data-tooltip="Clear"
      >
        <TrashIcon />
      </button>
      <div className="popover-anchor" ref={help.ref}>
        <button
          type="button"
          className="icon-button"
          onClick={help.toggle}
          aria-expanded={help.open}
          aria-label="Info"
          data-tooltip="Info"
        >
          <InfoIcon />
        </button>
        {help.open && <Help />}
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
      Labels are TeX (typeset with MathJax). Your work autosaves in this browser; to send it elsewhere, export it as a{" "}
      <em>Link</em>.
    </p>
  </div>
);
