/**
 * Colours with an alpha channel, as used for a diagram's stroke and
 * background (see `Colors` in types.ts).
 *
 * Kept as a hex colour plus a separate opacity (rather than `#rrggbbaa` or
 * `rgba()`) because that maps onto SVG's `fill-opacity` / `opacity`
 * attributes, which every SVG consumer understands; 8-digit hex and rgba()
 * in attributes are not reliably supported outside browsers.
 */

export interface Paint {
  /** Opaque sRGB colour, `#rrggbb` (lowercase). */
  readonly color: string;
  /** Opacity in [0, 1]; 0 is fully transparent. */
  readonly alpha: number;
}

const HEX = /^#[0-9a-f]{6}$/i;

export const isHexColor = (x: unknown): x is string => typeof x === "string" && HEX.test(x);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Validate untrusted data (e.g. from storage) as a Paint, or null. */
export const parsePaint = (x: unknown): Paint | null => {
  if (typeof x !== "object" || x === null) return null;
  const { color, alpha } = x as Record<string, unknown>;
  if (!isHexColor(color) || typeof alpha !== "number" || !Number.isFinite(alpha)) return null;
  return { color: color.toLowerCase(), alpha: clamp01(alpha) };
};

export const isTransparent = (p: Paint): boolean => p.alpha <= 0;

/** CSS `rgba()` for on-screen swatches. */
export const paintCss = ({ color, alpha }: Paint): string => {
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** Opacity rounded for compact SVG attributes. */
export const fmtAlpha = (a: number): string => String(Math.round(clamp01(a) * 1000) / 1000);

export const samePaint = (a: Paint, b: Paint): boolean => a.color === b.color && a.alpha === b.alpha;
