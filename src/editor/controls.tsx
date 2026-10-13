/**
 * Small form controls shared by the inspector and the toolbar popovers.
 * Their styles live under `.panel` in index.css.
 */
import type { CSSProperties, ReactNode } from "react";
import { paintCss, type Paint } from "../model/paint";

export interface Choice<T> {
  readonly value: T;
  readonly label: ReactNode;
  readonly title: string;
}

/** A row of mutually exclusive buttons (a radio group). */
export function Segmented<T>({ choices, value, onChange }: { choices: readonly Choice<T>[]; value: T; onChange: (v: T) => void }) {
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

/** A labelled line of a panel. */
export const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="row">
    <span className="row-label">{label}</span>
    {children}
  </div>
);

/**
 * A labelled on/off switch filling a panel row. The whole row is the
 * checkbox's <label>, so clicking the text toggles it as well.
 */
export const Switch = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="row">
    <span className="row-label">{label}</span>
    <input type="checkbox" role="switch" className="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
  </label>
);

export const Slider = ({
  min,
  max,
  step,
  value,
  onChange,
  format = String,
  label,
  onSettle,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  /** Accessible name, when the surrounding row label isn't enough. */
  label?: string;
  /** Called when the user lets go (end of a drag or key press), e.g. to end an undo step. */
  onSettle?: () => void;
}) => (
  <span className="slider">
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={e => onChange(Number(e.target.value))}
      onPointerUp={onSettle}
      onKeyUp={onSettle}
    />
    <output>{format(value)}</output>
  </span>
);

/**
 * A colour with opacity: a swatch (over a checkerboard, so transparency is
 * visible) that opens the native colour picker, plus an opacity slider.
 * Native `<input type="color">` has no alpha channel, hence the slider.
 */
export const PaintInput = ({
  value,
  onChange,
  label,
  onSettle,
}: {
  value: Paint;
  onChange: (p: Paint) => void;
  label: string;
  /** Called when the user is done with a change (slider released, picker closed). */
  onSettle?: () => void;
}) => (
  <span className="paint">
    <label className="swatch" title={`${label} color`} style={{ "--swatch": paintCss(value) } as CSSProperties}>
      <input
        type="color"
        value={value.color}
        aria-label={`${label} color`}
        onChange={e => onChange({ ...value, color: e.target.value.toLowerCase() })}
        onBlur={onSettle}
      />
    </label>
    <Slider
      min={0}
      max={100}
      step={1}
      value={Math.round(value.alpha * 100)}
      onChange={v => onChange({ ...value, alpha: v / 100 })}
      format={v => `${v}%`}
      label={`${label} opacity`}
      onSettle={onSettle}
    />
  </span>
);
