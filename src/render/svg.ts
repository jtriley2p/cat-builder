/**
 * Layout → SVG markup. Used both for the editor's diagram layer (per cell, so
 * React only re-injects cells whose markup changed) and for export (all cells
 * joined into one standalone document).
 *
 * Everything is drawn in `currentColor`; the container sets the actual ink.
 */
import { fmt } from "../geometry/bezier";
import type { CellLayout, LabelLayout, Layout, Stroke } from "../geometry/layout";
import type { Style } from "../geometry/style";
import { isEmptyBounds, type Bounds } from "../geometry/vec";

/** Embed a typeset label: MathJax's own <svg>, stretched onto the label box. */
const labelMarkup = ({ tex, box }: LabelLayout): string =>
  `<svg x="${fmt(box.cx - box.hw)}" y="${fmt(box.cy - box.hh)}" width="${fmt(2 * box.hw)}" height="${fmt(2 * box.hh)}" ` +
  `viewBox="${tex.viewBox}" overflow="visible">${tex.body}</svg>`;

const strokeMarkup = (s: Stroke, style: Style): string => {
  const dash =
    s.dash === "dashed"
      ? ` stroke-dasharray="${style.dashArray}"`
      : s.dash === "dotted"
        ? ` stroke-dasharray="${style.dotArray}"`
        : "";
  return `<path d="${s.d}"${dash}/>`;
};

/** Markup for one cell (without any wrapping group attributes). */
export const cellMarkup = (c: CellLayout, style: Style): string => {
  const label = c.label ? labelMarkup(c.label) : "";
  if (c.kind === "vertex") return label;
  const strokes = c.strokes.map(s => strokeMarkup(s, style)).join("");
  return (strokes ? `<g>${strokes}</g>` : "") + label;
};

/**
 * Presentation attributes for the group that holds the strokes. Set once on a
 * container so individual paths stay small.
 */
export const strokeAttributes = (style: Style) =>
  ({
    fill: "none",
    stroke: "currentColor",
    "stroke-width": String(style.stroke),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }) as const;

/**
 * Stroke attributes apply to label glyphs too unless overridden; MathJax sets
 * `fill`/`stroke`/`stroke-width` on its own root group, so labels are safe.
 */
const attrs = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("");

export interface StandaloneOptions {
  /** Margin around the drawing, in px. */
  readonly padding: number;
  /** CSS colour, or null for a transparent background. */
  readonly background: string | null;
  /** Colour of every stroke and (uncoloured) glyph. */
  readonly ink: string;
}

export interface StandaloneSvg {
  readonly markup: string;
  /** Intrinsic size in px (at scale 1). */
  readonly width: number;
  readonly height: number;
}

/** A complete, self-contained SVG document of the diagram, cropped to its bounds. */
export const standaloneSvg = (layout: Layout, style: Style, opts: StandaloneOptions): StandaloneSvg | null => {
  if (isEmptyBounds(layout.bounds)) return null;
  const b: Bounds = layout.bounds;
  // Snap the viewBox outward to whole pixels so rasterised exports stay crisp.
  const x = Math.floor(b.minX - opts.padding);
  const y = Math.floor(b.minY - opts.padding);
  const width = Math.ceil(b.maxX + opts.padding) - x;
  const height = Math.ceil(b.maxY + opts.padding) - y;
  const background = opts.background
    ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${opts.background}"/>`
    : "";
  const body = layout.cells.map(c => cellMarkup(c, style)).join("");
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">` +
    background +
    `<g color="${opts.ink}"${attrs(strokeAttributes(style))}>${body}</g>` +
    `</svg>`;
  return { markup, width, height };
};
