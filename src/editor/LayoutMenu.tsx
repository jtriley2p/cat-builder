/**
 * The toolbar's Layout button (a grid icon) and its popover: grid spacing
 * (part of the diagram, so undoable and shared), zoom (a view setting), and
 * "Fit and Center".
 */
import { setCellSize } from "../model/diagram";
import { CELL_SIZE_RANGE } from "../model/types";
import { Row, Slider } from "./controls";
import { GridIcon } from "./icons";
import { ZOOM_RANGE } from "./Canvas";
import { usePopover } from "./usePopover";
import type { Editor } from "./useEditor";

interface LayoutMenuProps {
  readonly editor: Editor;
  readonly zoom: number;
  /** Set the zoom, keeping the middle of the canvas in place. */
  readonly onZoom: (zoom: number) => void;
  /** Fit the diagram in view and centre it. */
  readonly onFit: () => void;
}

export const LayoutMenu = ({ editor, zoom, onZoom, onFit }: LayoutMenuProps) => {
  const popover = usePopover();
  const { diagram } = editor;
  return (
    <div className="popover-anchor" ref={popover.ref}>
      <button
        type="button"
        className="icon-button"
        onClick={popover.toggle}
        aria-expanded={popover.open}
        aria-label="Layout"
        data-tooltip="Layout"
      >
        <GridIcon />
      </button>
      {popover.open && (
        <div className="popover panel layout-panel" role="dialog" aria-label="Layout">
          <Row label="Spacing">
            <Slider
              min={CELL_SIZE_RANGE.min}
              max={CELL_SIZE_RANGE.max}
              step={10}
              value={diagram.cellSize}
              onChange={v => editor.commit(setCellSize(diagram, v), "cellSize")}
              onSettle={editor.seal}
              format={v => `${v}px`}
              label="Grid spacing"
            />
          </Row>
          <Row label="Zoom">
            <Slider
              min={ZOOM_RANGE.min * 100}
              max={ZOOM_RANGE.max * 100}
              step={5}
              value={Math.round(zoom * 100)}
              onChange={v => onZoom(v / 100)}
              format={v => `${v}%`}
              label="Zoom"
            />
          </Row>
          <div className="actions">
            <button type="button" onClick={onFit}>
              Fit and Center
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
