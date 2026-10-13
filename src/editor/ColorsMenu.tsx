/**
 * The toolbar's Colours button and popover: the diagram's stroke and
 * background colours, each with an opacity. Changes show on the canvas
 * immediately, are undoable, and are what exports use.
 */
import { setColors } from "../model/diagram";
import { samePaint } from "../model/paint";
import { DEFAULT_COLORS, type Colors } from "../model/types";
import { PaintInput, Row } from "./controls";
import { usePopover } from "./usePopover";
import type { Editor } from "./useEditor";

export const ColorsMenu = ({ editor }: { editor: Editor }) => {
  const popover = usePopover();
  const { diagram } = editor;
  const { colors } = diagram;
  // Live edits of one colour coalesce into a single undo step, ended when the control is released.
  const change = (key: keyof Colors) => (p: Colors[typeof key]) => editor.commit(setColors(diagram, { [key]: p }), `colors:${key}`);
  const isDefault = samePaint(colors.stroke, DEFAULT_COLORS.stroke) && samePaint(colors.background, DEFAULT_COLORS.background);

  return (
    <div className="popover-anchor" ref={popover.ref}>
      <button type="button" className="colors-button" onClick={popover.toggle} aria-expanded={popover.open} title="Diagram colours">
        <ColorsChip colors={colors} />
        Colours
      </button>
      {popover.open && (
        <div className="popover panel colors-panel" role="dialog" aria-label="Colours">
          <Row label="Stroke">
            <PaintInput label="Stroke" value={colors.stroke} onChange={change("stroke")} onSettle={editor.seal} />
          </Row>
          <Row label="Background">
            <PaintInput label="Background" value={colors.background} onChange={change("background")} onSettle={editor.seal} />
          </Row>
          <p className="muted note">
            Arrows and labels use the stroke colour. Exports look exactly like the canvas; a background at 0% exports as
            transparent.
          </p>
          <div className="actions">
            <button type="button" disabled={isDefault} onClick={() => editor.commit(setColors(diagram, DEFAULT_COLORS))}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** A tiny arrow drawn in the current colours, over a checkerboard. */
const ColorsChip = ({ colors: { stroke, background } }: { colors: Colors }) => (
  <span className="colors-chip checkerboard" aria-hidden="true">
    <svg viewBox="0 0 22 14" width="22" height="14">
      <rect width="22" height="14" fill={background.color} fillOpacity={background.alpha} />
      <path
        d="M4 7h13M13.5 3.8 17 7l-3.5 3.2"
        fill="none"
        stroke={stroke.color}
        strokeOpacity={stroke.alpha}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);
