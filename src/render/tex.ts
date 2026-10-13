/**
 * TeX → SVG typesetting via MathJax v4 (SVG output, classic TeX fonts).
 *
 * Labels are typeset to *paths*, not text, so exported SVGs are fully
 * self-contained: no fonts, no `<foreignObject>`, renders identically in
 * browsers, vector editors and when rasterised to PNG/WebP.
 *
 * Bundling note: MathJax's SVG output statically imports its default (New
 * Computer Modern) font. `plugins/mathjax-tex-font.ts` redirects that import
 * to the classic TeX font we actually use, so only one font ships.
 *
 * Results are memoised; typesetting is synchronous because every glyph of the
 * TeX font is bundled (no dynamic font loading).
 */
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import { MathJaxTexFont } from "@mathjax/mathjax-tex-font/js/svg.js";

/**
 * A typeset label. Metrics are in *em* (multiply by the font size in px);
 * the baseline is at y = 0, with ascent above and descent below.
 */
export interface TexBox {
  /** MathJax's viewBox (units of 1/1000 em, y downward, baseline at 0). */
  readonly viewBox: string;
  /** Inner SVG markup, drawn with `currentColor`. */
  readonly body: string;
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  /** TeX error message when the source failed to parse; the box then shows a placeholder. */
  readonly error: string | null;
}

/** `script` matches tikz-cd's default arrow-label size (\scriptstyle). */
export type TexSize = "normal" | "script";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

/** Set by `formatError` during a conversion; read and cleared right after. */
let pendingError: string | null = null;

const doc = mathjax.document("", {
  InputJax: new TeX({
    // No `newcommand` (definitions would leak between labels) and no
    // `noundefined` (we want undefined macros reported as errors).
    packages: ["base", "ams", "color", "boldsymbol"],
    formatError: (jax: TeX<unknown, unknown, unknown>, e: Error) => {
      pendingError = e.message;
      return jax.formatError(e as never);
    },
  }),
  OutputJax: new SVG({
    // Inline every glyph as a <path>: no <use>/<defs>, so labels can be
    // freely combined in one document without id clashes.
    fontCache: "none",
    fontData: MathJaxTexFont,
    // MathJax v4 splits long inline math into several <svg>s at break points.
    linebreaks: { inline: false },
  }),
});

/** Attributes that only matter for MathJax's own UI / accessibility tooling. */
const NOISE_ATTRS = / (?:data-[\w-]+|role|focusable|aria-[\w-]+)="[^"]*"/g;

const convert = (tex: string): Omit<TexBox, "error"> => {
  const container = doc.convert(tex, { display: false });
  const svg = adaptor.firstChild(container) as Parameters<typeof adaptor.getAttribute>[0];
  const viewBox = adaptor.getAttribute(svg, "viewBox") ?? "0 0 0 0";
  const [, minY = 0, w = 0, h = 0] = viewBox.split(/\s+/).map(Number);
  return {
    viewBox,
    body: adaptor.innerHTML(svg).replace(NOISE_ATTRS, ""),
    width: w / 1000,
    ascent: -minY / 1000,
    descent: (minY + h) / 1000,
  };
};

/** Shown in place of a label that failed to typeset. */
const PLACEHOLDER = "\\color{red}{\\boxed{?}}";

const cache = new Map<string, TexBox>();
const CACHE_LIMIT = 1000;

/**
 * Typeset `tex`, or return null for an empty/blank label. Never throws: TeX
 * errors are reported in `error` and drawn as a red placeholder.
 */
export const typeset = (tex: string, size: TexSize = "normal"): TexBox | null => {
  if (tex.trim() === "") return null;
  const key = `${size}\u0000${tex}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const source = size === "script" ? `{\\scriptstyle ${tex}}` : tex;
  pendingError = null;
  let box: TexBox;
  try {
    const out = convert(source);
    box = pendingError === null ? { ...out, error: null } : { ...convert(PLACEHOLDER), error: pendingError };
  } catch (e) {
    box = { ...convert(PLACEHOLDER), error: e instanceof Error ? e.message : String(e) };
  }
  pendingError = null;

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, box);
  return box;
};
