/**
 * Export preferences (format and scale). They are a per-browser convenience
 * kept in localStorage: anything missing or invalid there silently falls
 * back to the defaults, field by field.
 *
 * Colours are not export settings: they belong to the diagram (see
 * `Colors` in model/types.ts), which the canvas shows live.
 */
import { EXPORT_FORMATS, RASTER_SCALES, type ExportFormat } from "../render/export";

export interface ExportSettings {
  readonly format: ExportFormat;
  /** Pixel density for PNG/WebP. */
  readonly scale: number;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: "svg",
  scale: 2,
};

const STORAGE_KEY = "cat-builder:export";

/** Settings from untrusted data, keeping every valid field and defaulting the rest. */
export const parseExportSettings = (raw: unknown): ExportSettings => {
  const d = DEFAULT_EXPORT_SETTINGS;
  if (typeof raw !== "object" || raw === null) return d;
  const r = raw as Record<string, unknown>;
  // Colour fields saved by earlier versions are ignored.
  return {
    format: EXPORT_FORMATS.includes(r.format as ExportFormat) ? (r.format as ExportFormat) : d.format,
    scale: (RASTER_SCALES as readonly unknown[]).includes(r.scale) ? (r.scale as number) : d.scale,
  };
};

export const loadExportSettings = (): ExportSettings => {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text === null ? DEFAULT_EXPORT_SETTINGS : parseExportSettings(JSON.parse(text));
  } catch {
    // Blocked storage or corrupt JSON: defaults are fine.
    return DEFAULT_EXPORT_SETTINGS;
  }
};

export const saveExportSettings = (s: ExportSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Not worth bothering the user about: the settings just won't persist.
  }
};
