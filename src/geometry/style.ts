/**
 * Visual constants for drawing diagrams, in px at zoom 1. Kept in one object
 * so geometry functions take them as a parameter instead of reaching for
 * globals (and so tests can use simpler values if they want). A diagram's
 * own style comes from its font size and stroke width via `styleFor`.
 */
import { FONT_SIZE_RANGE, STROKE_WIDTH_RANGE } from "../model/types";

export interface Style {
  /** Font size of vertex labels (edge labels are \scriptstyle of this). */
  readonly em: number;
  /** Height of the TeX math axis above the baseline, in em: vertex labels are centred on it. */
  readonly axisHeight: number;
  /** Line width of every stroke. */
  readonly stroke: number;
  /** Centre-to-centre distance between the parallel lines of ⇒ / ⇛. */
  readonly lineGap: number;
  /** Arrowhead length and half-width for a single-line arrow (they grow with the line count). */
  readonly headLength: number;
  readonly headHalfWidth: number;
  /** Distance between the two heads of an epi (↠). */
  readonly epiGap: number;
  readonly hookRadius: number;
  /** Clearance between arrows and vertex labels. */
  readonly vertexPad: number;
  /** Clearance around unlabelled vertices. */
  readonly pointRadius: number;
  /** Clearance around the midpoint of an arrow that another arrow attaches to. */
  readonly anchorRadius: number;
  /** Distance between an arrow and a label beside it. */
  readonly labelGap: number;
  /** Clearance around a centred label where the arrow is broken. */
  readonly labelPad: number;
  /** Perpendicular shift per `offset` step. */
  readonly offsetUnit: number;
  /** Bend angle per `curve` step, in radians. */
  readonly curveStep: number;
  /** Loop control-point distance, as a fraction of the cell size. */
  readonly loopReach: number;
  /** Half the opening angle of a loop, in radians. */
  readonly loopSpread: number;
  readonly dashArray: string;
  readonly dotArray: string;
  readonly squiggleWavelength: number;
  readonly squiggleAmplitude: number;
  /** Distance of a pullback/pushout corner from the arrow's (clipped) end. */
  readonly cornerDistance: number;
  /** Arm length of a pullback/pushout corner. */
  readonly cornerSize: number;
  /** Half the size of the ⊣ symbol. */
  readonly turnstileSize: number;
}

export const DEFAULT_STYLE: Style = {
  em: FONT_SIZE_RANGE.default,
  axisHeight: 0.25,
  stroke: STROKE_WIDTH_RANGE.default,
  lineGap: 3.6,
  headLength: 6.5,
  headHalfWidth: 4.5,
  epiGap: 4,
  hookRadius: 3.5,
  vertexPad: 6,
  pointRadius: 3,
  anchorRadius: 10,
  labelGap: 4.5,
  labelPad: 3,
  offsetUnit: 6,
  curveStep: Math.PI / 12,
  loopReach: 0.75,
  loopSpread: 0.65,
  dashArray: "4 4",
  dotArray: "0 3.5",
  squiggleWavelength: 7,
  squiggleAmplitude: 2,
  cornerDistance: 10,
  cornerSize: 7,
  turnstileSize: 5,
};

/** Scale every length in a dash pattern such as "4 4". */
const scaleDash = (pattern: string, k: number): string =>
  pattern
    .split(" ")
    .map(n => Number((Number(n) * k).toFixed(2)))
    .join(" ");

/**
 * The style for a diagram's font size and stroke width (both in px).
 *
 * The arrow details drawn with the stroke scale in proportion to its width,
 * so heavier arrows keep their shape: arrowheads, the spacing of ⇒/⇛ (which
 * would otherwise merge), epi heads, hooks, dash and dot patterns, and
 * squiggles. Clearances, ⊣ and corner marks, and loop geometry stay fixed.
 */
export const styleFor = (em: number, stroke: number): Style => {
  const d = DEFAULT_STYLE;
  const k = stroke / d.stroke;
  return {
    ...d,
    em,
    stroke,
    lineGap: d.lineGap * k,
    headLength: d.headLength * k,
    headHalfWidth: d.headHalfWidth * k,
    epiGap: d.epiGap * k,
    hookRadius: d.hookRadius * k,
    dashArray: scaleDash(d.dashArray, k),
    dotArray: scaleDash(d.dotArray, k),
    squiggleWavelength: d.squiggleWavelength * k,
    squiggleAmplitude: d.squiggleAmplitude * k,
  };
};
