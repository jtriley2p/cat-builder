/**
 * Side panel for the current selection: label editing for a single cell, and
 * arrow options for every selected edge. Option changes apply to *all*
 * selected edges (handy for e.g. "make these dashed"); the controls show the
 * values of the first selected edge.
 */
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
import { Row, Segmented, Slider, type Choice } from "./controls";
import { DirectionIcon, LabelSideIcon } from "./icons";
import { MOD } from "./platform";
import type { Editor } from "./useEditor";

interface InspectorProps {
  readonly editor: Editor;
  readonly labelRef: React.RefObject<HTMLTextAreaElement | null>;
}

const STYLE_CHOICES: Choice<EdgeStyle>[] = [
  { value: "arrow", label: "→", title: "Arrow" },
  { value: "adjunction", label: "⊣", title: "Adjunction (⊣ facing the target)" },
  { value: "pullback", label: "⌟", title: "Pullback corner (at the source)" },
  { value: "pushout", label: "⌜", title: "Pushout corner (at the target)" },
];
/** Label sides; their icons are drawn per arrow (see `LabelSideIcon`), so only titles live here. */
const SIDES: { readonly value: LabelSide; readonly title: string }[] = [
  { value: "left", title: "Left of the arrow (above it, if horizontal)" },
  { value: "centre", title: "On the arrow, with the arrow broken around it" },
  { value: "over", title: "Over the arrow" },
  { value: "right", title: "Right of the arrow (below it, if horizontal)" },
];

/** Used when an arrow has no geometry (its endpoints overlap): show a horizontal arrow. */
const FALLBACK_FRAME = { along: { x: 1, y: 0 }, left: { x: 0, y: -1 } } as const;
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
/** Loop directions laid out as a 3×3 pad around the object (null = the middle). Angles: 0 = right, 90 = down. */
const LOOP_PAD: readonly (readonly [number, string] | null)[] = [
  [225, "Up-left"],
  [270, "Up"],
  [315, "Up-right"],
  [180, "Left"],
  null,
  [0, "Right"],
  [135, "Down-left"],
  [90, "Down"],
  [45, "Down-right"],
];

/** A 3×3 grid of arrows pointing outward from an empty middle (standing in for the object). */
const DirectionPad = ({ value, onChange }: { value: number; onChange: (angle: number) => void }) => (
  <div className="direction-pad" role="radiogroup" aria-label="Loop direction">
    {LOOP_PAD.map(entry =>
      entry === null ? (
        <span key="middle" className="direction-middle" aria-hidden="true" />
      ) : (
        <button
          key={entry[0]}
          type="button"
          role="radio"
          aria-checked={entry[0] === value}
          className={entry[0] === value ? "active" : ""}
          title={entry[1]}
          onClick={() => onChange(entry[0])}
        >
          <DirectionIcon angle={entry[0]} />
        </button>
      ),
    )}
  </div>
);

/** What Tab inserts in the label editor. */
const INDENT = "    ";

/**
 * Type `text` at the caret of a (React-controlled) textarea, replacing any
 * selection. `execCommand("insertText")` behaves like real typing: it fires
 * the usual input event (so `onChange` runs) and keeps the browser's own
 * undo for the field. It is deprecated but still universally supported; if
 * it is ever refused, splice the value ourselves via `onChange` and put the
 * caret back once React has re-rendered.
 */
const insertText = (el: HTMLTextAreaElement, text: string, onChange: (value: string) => void) => {
  if (document.execCommand("insertText", false, text)) return;
  const { selectionStart: start, selectionEnd: end, value } = el;
  onChange(value.slice(0, start) + text + value.slice(end));
  requestAnimationFrame(() => el.setSelectionRange(start + text.length, start + text.length));
};

export const Inspector = ({ editor, labelRef }: InspectorProps) => {
  const { diagram, selection } = editor;
  if (selection.size === 0) return null;

  const cells = [...selection].map(id => getCell(diagram, id)).filter(c => c !== undefined);
  const edges = cells.filter((c): c is Edge => c.kind === "edge");
  const single = cells.length === 1 ? cells[0]! : null;
  const primary = edges[0];

  // Label-side icons preview the placement on the first selected arrow, in its orientation.
  const primaryLayout = primary ? editor.layout.byId.get(primary.id) : undefined;
  const frame = (primaryLayout?.kind === "edge" ? primaryLayout.frame : null) ?? FALLBACK_FRAME;
  const sideChoices: Choice<LabelSide>[] = SIDES.map(s => ({ ...s, label: <LabelSideIcon side={s.value} along={frame.along} left={frame.left} /> }));

  // Slider drags coalesce into one undo step per option and selection.
  const selectionKey = [...selection].join(",");
  const patch = (p: Partial<EdgeOptions>, coalesce: string | null = null) =>
    editor.commit(updateEdgeOptions(diagram, selection, p), coalesce && `${coalesce}:${selectionKey}`);

  // Labels apply to objects and to ordinary arrows; ⊣ and corners are pure symbols.
  const labelled = single && (single.kind === "vertex" || single.options.style === "arrow") ? single : null;
  const labelError = labelled ? (typeset(labelled.label, labelled.kind === "edge" ? "script" : "normal")?.error ?? null) : null;

  return (
    <aside className="inspector panel">
      <header>
        {single ? (single.kind === "vertex" ? "Object" : isLoop(single) ? "Loop" : "Arrow") : `${cells.length} selected`}
      </header>

      {/* Multi-line, so long labels can be laid out over several lines (newlines
          are whitespace in TeX, and `%` comments end at the line). Enter adds a
          line; Tab indents; Esc or ⌘/Ctrl+Enter finishes. */}
      {labelled && (
        <label className="field">
          <span>
            Label (TeX) <span className="field-hint">· Esc or {MOD}↩ to finish</span>
          </span>
          <textarea
            ref={labelRef}
            className={labelError ? "invalid" : ""}
            value={labelled.label}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            placeholder={labelled.kind === "vertex" ? "e.g. \\mathcal{C}" : "e.g. f"}
            onChange={e => editor.commit(setLabel(diagram, labelled.id, e.target.value), `label:${labelled.id}`)}
            onBlur={() => editor.seal()}
            onKeyDown={e => {
              const el = e.currentTarget;
              if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
                e.preventDefault();
                el.blur();
              } else if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
                // Indent rather than move focus (Shift+Tab still moves it back).
                e.preventDefault();
                insertText(el, INDENT, value => editor.commit(setLabel(diagram, labelled.id, value), `label:${labelled.id}`));
              }
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
                <Segmented choices={sideChoices} value={primary.options.labelSide} onChange={labelSide => patch({ labelSide })} />
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
                <DirectionPad value={primary.options.loopAngle} onChange={loopAngle => patch({ loopAngle })} />
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
