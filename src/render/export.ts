/**
 * Image export: SVG directly from the layout; PNG/WebP by rasterising that
 * SVG on a canvas. Because labels are paths (no fonts or external resources),
 * the canvas is never tainted and the result matches the SVG exactly.
 */
import type { Layout } from "../geometry/layout";
import type { Style } from "../geometry/style";
import { err, ok, type Result } from "../lib/result";
import { standaloneSvg } from "./svg";

export const EXPORT_FORMATS = ["svg", "png", "webp"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const RASTER_SCALES = [1, 2, 3, 4] as const;

export interface ExportOptions {
  readonly format: ExportFormat;
  /** Pixel density multiplier for PNG/WebP (ignored for SVG). */
  readonly scale: number;
  /** CSS colour, or null for transparent. */
  readonly background: string | null;
  readonly ink: string;
}

export type ExportError =
  | "empty-diagram"
  /** The browser cannot encode WebP from a canvas (notably Safari). */
  | "webp-unsupported"
  /** The browser failed to load or encode the rasterised image. */
  | "raster-failed";

export const describeExportError = (e: ExportError): string => {
  switch (e) {
    case "empty-diagram":
      return "Nothing to export yet: the diagram is empty.";
    case "webp-unsupported":
      return "This browser can't encode WebP images (Safari doesn't support it). Export as PNG instead, or use another browser.";
    case "raster-failed":
      return "The browser failed to render the image. Try SVG, or a smaller scale.";
  }
};

/** Space around the drawing in exported images, in px at scale 1. */
const PADDING = 12;

const MIME: Record<ExportFormat, string> = { svg: "image/svg+xml", png: "image/png", webp: "image/webp" };

let webpSupport: boolean | undefined;

/**
 * Whether `canvas.toBlob` can produce WebP. Browsers that can't silently fall
 * back to PNG, so probe once by checking the produced data URL's type.
 */
export const canEncodeWebp = (): boolean => {
  if (webpSupport === undefined) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp");
  }
  return webpSupport;
};

export interface ExportedImage {
  readonly blob: Blob;
  readonly filename: string;
}

export const exportImage = async (
  layout: Layout,
  style: Style,
  opts: ExportOptions,
): Promise<Result<ExportedImage, ExportError>> => {
  if (opts.format === "webp" && !canEncodeWebp()) return err("webp-unsupported");
  const svg = standaloneSvg(layout, style, { padding: PADDING, background: opts.background, ink: opts.ink });
  if (!svg) return err("empty-diagram");

  if (opts.format === "svg") {
    return ok({ blob: new Blob([svg.markup], { type: MIME.svg }), filename: "diagram.svg" });
  }

  const width = Math.round(svg.width * opts.scale);
  const height = Math.round(svg.height * opts.scale);
  // Bake the scale into the SVG's intrinsic size so it is rasterised at full
  // resolution rather than drawn small and upscaled.
  const scaled = svg.markup.replace(`width="${svg.width}" height="${svg.height}"`, `width="${width}" height="${height}"`);
  const blob = await rasterize(scaled, width, height, MIME[opts.format]);
  if (!blob) return err("raster-failed");
  const suffix = opts.scale === 1 ? "" : `@${opts.scale}x`;
  return ok({ blob, filename: `diagram${suffix}.${opts.format}` });
};

const rasterize = async (markup: string, width: number, height: number, mime: string): Promise<Blob | null> => {
  const url = URL.createObjectURL(new Blob([markup], { type: MIME.svg }));
  try {
    const img = new Image(width, height);
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, 0.95));
    return blob && blob.type === mime ? blob : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Save a blob through the browser's download mechanism. */
export const downloadBlob = ({ blob, filename }: ExportedImage): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Give the download a moment to start before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
