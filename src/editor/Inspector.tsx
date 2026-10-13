/**
 * Side panel for the current selection: label editing for a single cell, and
 * arrow options for every selected edge. Option changes apply to *all*
 * selected edges (handy for e.g. "make these dashed"); the controls show the
 * values of the first selected edge.
 */
import type { ReactNode } from "react";
import { getCell, isLoop, removeCells, reverseEdges, setLabel, updateEdgeOptions } from "../model/diagram";
import {
  CURVE_RANGE,
  OFFSET_RANGE,
  type BodyStyle,
  type Edge,
  type EdgeOptions,
  type EdgeStyle,
  type HeadStyle,
  type LabelSide,
  type LineCount,
  type TailStyle,
} from "../model/types";
import { typeset } from "../render/tex";
import type { Editor } from "./useEditor";

interface InspectorProps {
  readonly editor: Editor;
  readonly labelRef: React.RefObject<HTMLInputElement | null>;
}

interface Choice<T> {
  readonly value: T;
  readonly label: ReactNode;
  readonly title: string;
}

const STYLE_CHOICES: Choice<EdgeStyle>[] = [
  { value: "arrow", label: "→", title: "Arrow" },
  { value: "adjunction", label: "⊣", title: "Adjunction (⊣ facing the target)" },
  { value: "pullback", label: "⌟", title: "Pullback corner (at the source)" },
  { value: "pushout", label: "⌜", title: "Pushout corner (at the target)" },
];
const SIDE_CHOICES: Choice<LabelSide>[] = [
  { value: "left", label: "Left", title: "Label left of the arrow" },
  { value: "centre", label: "Centre", title: "Label on the arrow, arrow broken around it" },
  { value: "over", label: "Over", title: "Label drawn over the arrow" },
  { value: "right", label: "Right", title: "Label right of the arrow" },
];
const TAIL_CHOICES: Choice<TailStyle>[] = [
  { value: "none", label: "—", title: "No tail" },
  { value: "mono", label: "↣", title: "Mono tail" },
  { value: "hook", label: "↪", title: "Hook (inclusion)" },
  { value: "maps-to", label: "↦", title: "Maps to" },
];
const BODY_CHOICES: Choice<BodyStyle>[] = [
  { value: "solid", label: "—", title: "Solid" },
  { value: "dashed", label: "╌", title: "Dashed" },
  { value: "dotted", label: "⋯", title: "Dotted" },
  { value: "squiggly", label: "⁓", title: "Squiggly" },
  { value: "none", label: "∅", title: "No body (label/decorations only)" },
];
const HEAD_CHOICES: Choice<HeadStyle>[] = [
  { value: "arrow", label: "→", title: "Arrowhead" },
  { value: "epi", label: "↠", title: "Epi (two heads)" },
  { value: "none", label: "—", title: "No head" },
];
const LINE_CHOICES: Choice<LineCount>[] = [
  { value: 1, label: "→", title: "Single" },
  { value: 2, label: "⇒", title: "Double" },
  { value: 3, label: "⇛", title: "Triple" },
];
const LOOP_DIRECTIONS: Choice<number>[] = [
  { value: 270, label: "↑", title: "Up" },
  { value: 315, label: "↗", title: "Up-right" },
  { value: 0, label: "→", title: "Right" },
  { value: 45, label: "↘", title: "Down-right" },
  { value: 90, label: "↓", title: "Down" },
  { value: 135, label: "↙", title: "Down-left" },
  { value: 180, label: "←", title: "Left" },
  { value: 225, label: "↖", title: "Up-left" },
];

function Segmented<T>({ choices, value, onChange }: { choices: Choice<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {choices.map(c => (
        <button
          key={String(c.value)}
          type="button"
          role="radio"
          aria-checked={c.value === value}
          className={c.value === value ? "active" : ""}
          title={c.title}
          onClick={() => onChange(c.value)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="row">
    <span className="row-label">{label}</span>
    {children}
  </div>
);

const Slider = ({
  min,
  max,
  step,
  value,
  onChange,
  format = String,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) => (
  <span className="slider">
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    <output>{format(value)}</output>
  </span>
);

export const Inspector = ({ editor, labelRef }: InspectorProps) => {
  const { diagram, selection } = editor;
  if (selection.size === 0) return null;

  const cells = [...selection].map(id => getCell(diagram, id)).filter(c => c !== undefined);
  const edges = cells.filter((c): c is Edge => c.kind === "edge");
  const single = cells.length === 1 ? cells[0]! : null;
  const primary = edges[0];

  // Slider drags coalesce into one undo step per option and selection.
  const selectionKey = [...selection].join(",");
  const patch = (p: Partial<EdgeOptions>, coalesce: string | null = null) =>
    editor.commit(updateEdgeOptions(diagram, selection, p), coalesce && `${coalesce}:${selectionKey}`);

  // Labels apply to objects and to ordinary arrows; ⊣ and corners are pure symbols.
  const labelled = single && (single.kind === "vertex" || single.options.style === "arrow") ? single : null;
  const labelError = labelled ? (typeset(labelled.label, labelled.kind === "edge" ? "script" : "normal")?.error ?? null) : null;

  return (
    <aside className="inspector">
      <header>
        {single ? (single.kind === "vertex" ? "Object" : isLoop(single) ? "Loop" : "Arrow") : `${cells.length} selected`}
      </header>

      {labelled && (
        <label className="field">
          <span>Label (TeX)</span>
          <input
            ref={labelRef}
            className={labelError ? "invalid" : ""}
            value={labelled.label}
            spellCheck={false}
            autoComplete="off"
            placeholder={labelled.kind === "vertex" ? "e.g. \\mathcal{C}" : "e.g. f"}
            onChange={e => editor.commit(setLabel(diagram, labelled.id, e.target.value), `label:${labelled.id}`)}
            onBlur={() => editor.seal()}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
          />
          {labelError && <small className="error">{labelError}</small>}
        </label>
      )}

      {primary && (
        <>
          <Row label="Style">
            <Segmented choices={STYLE_CHOICES} value={primary.options.style} onChange={style => patch({ style })} />
          </Row>
          {primary.options.style === "arrow" && (
            <>
              <Row label="Label">
                <Segmented choices={SIDE_CHOICES} value={primary.options.labelSide} onChange={labelSide => patch({ labelSide })} />
              </Row>
              <Row label="Along">
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(primary.options.labelPos * 100)}
                  onChange={v => patch({ labelPos: v / 100 }, "labelPos")}
                  format={v => `${v}%`}
                />
              </Row>
              <Row label="Tail">
                <Segmented choices={TAIL_CHOICES} value={primary.options.tail} onChange={tail => patch({ tail })} />
              </Row>
              <Row label="Body">
                <Segmented choices={BODY_CHOICES} value={primary.options.body} onChange={body => patch({ body })} />
              </Row>
              <Row label="Head">
                <Segmented choices={HEAD_CHOICES} value={primary.options.head} onChange={head => patch({ head })} />
              </Row>
              <Row label="Lines">
                <Segmented choices={LINE_CHOICES} value={primary.options.lines} onChange={lines => patch({ lines })} />
              </Row>
            </>
          )}
          {isLoop(primary) ? (
            <>
              <Row label="Direction">
                <Segmented
                  choices={LOOP_DIRECTIONS}
                  value={primary.options.loopAngle}
                  onChange={loopAngle => patch({ loopAngle })}
                />
              </Row>
              <Row label="Size">
                <Slider min={CURVE_RANGE.min} max={CURVE_RANGE.max} step={1} value={primary.options.curve} onChange={curve => patch({ curve }, "curve")} />
              </Row>
            </>
          ) : (
            <>
              <Row label="Curve">
                <Slider min={CURVE_RANGE.min} max={CURVE_RANGE.max} step={1} value={primary.options.curve} onChange={curve => patch({ curve }, "curve")} />
              </Row>
              <Row label="Offset">
                <Slider min={OFFSET_RANGE.min} max={OFFSET_RANGE.max} step={1} value={primary.options.offset} onChange={offset => patch({ offset }, "offset")} />
              </Row>
            </>
          )}
        </>
      )}

      <div className="actions">
        {edges.length > 0 && (
          <button type="button" onClick={() => editor.commit(reverseEdges(diagram, selection))} title="Swap source and target">
            Reverse
          </button>
        )}
        <button type="button" className="danger" onClick={() => editor.commit(removeCells(diagram, selection))} title="Delete (⌫)">
          Delete
        </button>
      </div>
    </aside>
  );
};
