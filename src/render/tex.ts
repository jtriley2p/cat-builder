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
 *
 * Security: labels are untrusted — they arrive in share links and autosave —
 * and the markup produced here is injected into the page and into exported
 * SVGs. MathJax's TeX input lets a label set arbitrary attributes
 * (`\mmlToken{mi}[href="javascript:…" style="…"]{x}` becomes a live link) and
 * passes unknown colour names through verbatim (`\color{url(https://…)}`
 * makes the browser fetch that URL). So the markup is never taken from
 * MathJax as-is: `safeMarkup` rebuilds it from an allowlist of elements and
 * attributes, with its own escaping.
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
  /** Inner SVG markup, drawn with `currentColor`; sanitized (see `safeMarkup`). */
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

// ---------------------------------------------------------------------------
// Sanitizing MathJax's output (see the security note at the top)
// ---------------------------------------------------------------------------

type LiteNode = Parameters<typeof adaptor.kind>[0];
type LiteElement = Parameters<typeof adaptor.getAttribute>[0];

/**
 * Elements MathJax's SVG output uses for the packages loaded above: glyphs
 * and rules are paths, rects and polygons in nested groups/svgs, array rules
 * are lines, and characters missing from the TeX font fall back to `<text>`.
 * Any other element is dropped with its content — e.g. `<image>`, which
 * `\mmlToken{mglyph}[src="…"]` would otherwise use to fetch a URL. (Loading
 * more TeX packages may need more here, e.g. `enclose` draws `<ellipse>`.)
 */
const ELEMENTS = new Set(["svg", "g", "path", "rect", "polygon", "line", "text"]);

/**
 * Elements replaced by their children: `<a>` wraps whatever a label gave an
 * `href` (and `\eqref`, whose target never exists in a label anyway).
 */
const UNWRAP = new Set(["a"]);

/**
 * Attributes whose values MathJax computes (geometry, transforms, the font
 * fallback for `<text>`). Notably absent: href, style, class, id, event
 * handlers, and MathJax's data-/aria-/role attributes (only useful to its own
 * UI and accessibility tooling).
 */
const ATTRS = new Set([
  "d",
  "points",
  "transform",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "viewBox",
  "stroke-width",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
]);

/** Attributes holding a colour, which a label controls through `\color` and friends. */
const PAINT_ATTRS = new Set(["fill", "stroke"]);

/**
 * A plain colour: hex, or a bare keyword (a CSS colour name, `currentColor`,
 * `none`). Rules out `url(…)` paint-server references, which would make the
 * browser fetch an arbitrary URL.
 */
const PAINT = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+)$/i;

const keepAttribute = ({ name, value }: { name: string; value: string }): boolean =>
  ATTRS.has(name) || (PAINT_ATTRS.has(name) && PAINT.test(value));

/** Escape text for an XML/HTML attribute value or text node. */
const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Serialize a node of MathJax's output keeping only allowlisted elements and
 * attributes (anything a label could abuse is dropped, not escaped), so the
 * result is safe to inject into the page and to export.
 */
const safeMarkup = (node: LiteNode): string => {
  const kind = adaptor.kind(node);
  if (kind === "#text") return escapeXml(adaptor.value(node));
  if (kind.startsWith("#")) return ""; // comments
  const element = node as LiteElement;
  if (UNWRAP.has(kind)) return adaptor.childNodes(element).map(safeMarkup).join("");
  if (!ELEMENTS.has(kind)) return "";
  const attrs = adaptor
    .allAttributes(element)
    .filter(keepAttribute)
    .map(({ name, value }) => ` ${name}="${escapeXml(value)}"`)
    .join("");
  return `<${kind}${attrs}>${adaptor.childNodes(element).map(safeMarkup).join("")}</${kind}>`;
};

// ---------------------------------------------------------------------------
// Typesetting
// ---------------------------------------------------------------------------

const convert = (tex: string): Omit<TexBox, "error"> => {
  const container = doc.convert(tex, { display: false });
  const svg = adaptor.firstChild(container) as LiteElement;
  const viewBox = adaptor.getAttribute(svg, "viewBox") ?? "0 0 0 0";
  const [, minY = 0, w = 0, h = 0] = viewBox.split(/\s+/).map(Number);
  return {
    viewBox,
    body: adaptor.childNodes(svg).map(safeMarkup).join(""),
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

  // The closing brace goes on its own line so a trailing `%` comment can't swallow it.
  const source = size === "script" ? `{\\scriptstyle ${tex}\n}` : tex;
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
