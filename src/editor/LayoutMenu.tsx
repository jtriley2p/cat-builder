/**
 * The toolbar's Layout button (a grid icon) and its popover, in order: grid
 * spacing, zoom, label font size, arrow stroke width, grid visibility, and
 * "Fit and Center". Spacing, font size and stroke belong to the diagram (so
 * they are undoable, shared and exported); zoom and grid visibility are view
 * settings (the grid is never exported).
 */
import { setCellSize, setFontSize, setStrokeWidth } from "../model/diagram";
import { CELL_SIZE_RANGE, FONT_SIZE_RANGE, STROKE_WIDTH_RANGE } from "../model/types";
import { Row, Slider, Switch } from "./controls";
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
  readonly showGrid: boolean;
  readonly onShowGrid: (show: boolean) => void;
}

export const LayoutMenu = ({ editor, zoom, onZoom, onFit, showGrid, onShowGrid }: LayoutMenuProps) => {
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
          <Row label="Font Size">
            <Slider
              min={FONT_SIZE_RANGE.min}
              max={FONT_SIZE_RANGE.max}
              step={1}
              value={diagram.fontSize}
              onChange={v => editor.commit(setFontSize(diagram, v), "fontSize")}
              onSettle={editor.seal}
              format={v => `${v}px`}
              label="Label font size"
            />
          </Row>
          <Row label="Stroke">
            <Slider
              min={STROKE_WIDTH_RANGE.min}
              max={STROKE_WIDTH_RANGE.max}
              step={0.1}
              value={diagram.strokeWidth}
              onChange={v => editor.commit(setStrokeWidth(diagram, v), "strokeWidth")}
              onSettle={editor.seal}
              format={v => `${v.toFixed(1)}px`}
              label="Arrow stroke width"
            />
          </Row>
          <Switch label="Show Grid" checked={showGrid} onChange={onShowGrid} />
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
