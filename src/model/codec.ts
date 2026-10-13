/**
 * Serialization of diagrams, used for browser autosave and share links.
 *
 * Compact form (kept small because it ends up in URLs):
 *
 *     [version, cellSize, cells, colors?]
 *     vertex: [col, row, label]
 *     edge:   [sourceIndex, targetIndex, label, options]
 *     colors: { s?: [hex, alpha], b?: [hex, alpha] }   (stroke, background)
 *
 * Endpoints are indices into `cells` and must point *backwards* (the
 * topological-order invariant). `options` only lists values that differ from
 * `DEFAULT_EDGE_OPTIONS`, using the short keys in `OPTION_KEYS`. Likewise
 * `colors` only lists colours that differ from `DEFAULT_COLORS`, and is
 * omitted entirely when both are default — so data written before colours
 * existed (three elements) is still valid.
 *
 * Share links are `#d=` + base64url(deflate-raw(JSON(compact))).
 */
import { err, ok, type Result } from "../lib/result";
import { normalizeOptions } from "./diagram";
import { parsePaint, samePaint, type Paint } from "./paint";
import {
  BODY_STYLES,
  CELL_SIZE_RANGE,
  DEFAULT_COLORS,
  DEFAULT_EDGE_OPTIONS,
  EDGE_STYLES,
  HEAD_STYLES,
  LABEL_SIDES,
  LINE_COUNTS,
  TAIL_STYLES,
  type Cell,
  type CellId,
  type Colors,
  type Diagram,
  type EdgeOptions,
} from "./types";

export const FORMAT_VERSION = 1;

export type DecodeError =
  /** The link payload is not valid base64url or does not decompress. */
  | { readonly kind: "malformed-link" }
  | { readonly kind: "invalid-json" }
  | { readonly kind: "unsupported-version"; readonly version: unknown }
  /** Parsed fine, but does not describe a valid diagram. */
  | { readonly kind: "invalid-structure"; readonly detail: string };

export const describeDecodeError = (e: DecodeError): string => {
  switch (e.kind) {
    case "malformed-link":
      return "The link is damaged or incomplete.";
    case "invalid-json":
      return "The saved data is not valid JSON.";
    case "unsupported-version":
      return `The diagram uses an unsupported format version (${String(e.version)}).`;
    case "invalid-structure":
      return `The diagram data is invalid: ${e.detail}.`;
  }
};

// ---------------------------------------------------------------------------
// Options <-> short-key objects
// ---------------------------------------------------------------------------

/** Short serialized key for each edge option. */
const OPTION_KEYS = {
  style: "s",
  labelSide: "ls",
  labelPos: "lp",
  tail: "t",
  body: "b",
  head: "h",
  lines: "n",
  curve: "c",
  offset: "o",
  loopAngle: "la",
} as const satisfies Record<keyof EdgeOptions, string>;

type OptionKey = keyof EdgeOptions;
const optionKeys = Object.keys(OPTION_KEYS) as OptionKey[];

/** labelPos is stored as an integer percentage to keep links short. */
const toStored = (k: OptionKey, v: EdgeOptions[OptionKey]) => (k === "labelPos" ? Math.round((v as number) * 100) : v);
const fromStored = (k: OptionKey, v: unknown) => (k === "labelPos" && typeof v === "number" ? v / 100 : v);

const encodeOptions = (o: EdgeOptions): Record<string, unknown> =>
  Object.fromEntries(
    optionKeys
      .filter(k => toStored(k, o[k]) !== toStored(k, DEFAULT_EDGE_OPTIONS[k]))
      .map(k => [OPTION_KEYS[k], toStored(k, o[k])]),
  );

/** Allowed values for each enumerated option; numeric options are checked for finiteness. */
const ENUMS: Partial<Record<OptionKey, readonly unknown[]>> = {
  style: EDGE_STYLES,
  labelSide: LABEL_SIDES,
  tail: TAIL_STYLES,
  body: BODY_STYLES,
  head: HEAD_STYLES,
  lines: LINE_COUNTS,
};

const decodeOptions = (raw: unknown, where: string): Result<EdgeOptions, DecodeError> => {
  if (!isRecord(raw)) return invalid(`${where}: options must be an object`);
  const out: Record<string, unknown> = { ...DEFAULT_EDGE_OPTIONS };
  for (const k of optionKeys) {
    const stored = raw[OPTION_KEYS[k]];
    if (stored === undefined) continue;
    const v = fromStored(k, stored);
    const allowed = ENUMS[k];
    const valid = allowed ? allowed.includes(v) : typeof v === "number" && Number.isFinite(v);
    if (!valid) return invalid(`${where}: bad value for "${k}"`);
    out[k] = v;
  }
  return ok(normalizeOptions(out as unknown as EdgeOptions));
};

// ---------------------------------------------------------------------------
// Colors <-> short-key objects
// ---------------------------------------------------------------------------

const COLOR_KEYS = { stroke: "s", background: "b" } as const satisfies Record<keyof Colors, string>;
const colorKeys = Object.keys(COLOR_KEYS) as (keyof Colors)[];

/** Non-default colours as `{ s: [hex, alpha], … }`, or null when all are default. */
const encodeColors = (c: Colors): Record<string, readonly [string, number]> | null => {
  const entries = colorKeys
    .filter(k => !samePaint(c[k], DEFAULT_COLORS[k]))
    .map(k => [COLOR_KEYS[k], [c[k].color, Math.round(c[k].alpha * 1000) / 1000]] as const);
  return entries.length === 0 ? null : Object.fromEntries(entries);
};

const decodeColors = (raw: unknown): Result<Colors, DecodeError> => {
  if (!isRecord(raw)) return invalid("colours must be an object");
  const out: Record<string, Paint> = { ...DEFAULT_COLORS };
  for (const k of colorKeys) {
    const stored = raw[COLOR_KEYS[k]];
    if (stored === undefined) continue;
    const paint = Array.isArray(stored) && stored.length === 2 ? parsePaint({ color: stored[0], alpha: stored[1] }) : null;
    if (!paint) return invalid(`bad ${k} colour`);
    out[k] = paint;
  }
  return ok(out as unknown as Colors);
};

// ---------------------------------------------------------------------------
// Diagram <-> compact form
// ---------------------------------------------------------------------------

export const toCompact = (d: Diagram): unknown[] => {
  const index = new Map(d.cells.map((c, i) => [c.id, i]));
  const cells = d.cells.map(c =>
    c.kind === "vertex"
      ? [c.col, c.row, c.label]
      : [index.get(c.source), index.get(c.target), c.label, encodeOptions(c.options)],
  );
  const colors = encodeColors(d.colors);
  return colors ? [FORMAT_VERSION, d.cellSize, cells, colors] : [FORMAT_VERSION, d.cellSize, cells];
};

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => Number.isInteger(x);
const invalid = (detail: string) => err<DecodeError>({ kind: "invalid-structure", detail });

export const fromCompact = (raw: unknown): Result<Diagram, DecodeError> => {
  if (!Array.isArray(raw) || (raw.length !== 3 && raw.length !== 4)) return invalid("expected [version, cellSize, cells, colors?]");
  const [version, cellSize, rawCells, rawColors] = raw;
  if (version !== FORMAT_VERSION) return err({ kind: "unsupported-version", version });
  if (typeof cellSize !== "number" || cellSize < CELL_SIZE_RANGE.min || cellSize > CELL_SIZE_RANGE.max)
    return invalid("cell size out of range");
  if (!Array.isArray(rawCells)) return invalid("cells must be a list");
  const colors = rawColors === undefined ? ok(DEFAULT_COLORS) : decodeColors(rawColors);
  if (!colors.ok) return colors;

  const cells: Cell[] = [];
  const occupied = new Set<string>();
  const idAt = (i: number): CellId => `c${i + 1}`;

  for (const [i, rc] of rawCells.entries()) {
    const where = `cell ${i}`;
    if (!Array.isArray(rc)) return invalid(`${where} must be a list`);
    if (rc.length === 3) {
      const [col, row, label] = rc;
      if (!isInt(col) || !isInt(row) || typeof label !== "string") return invalid(`${where}: bad vertex`);
      if (occupied.has(`${col},${row}`)) return invalid(`${where}: two vertices share a grid position`);
      occupied.add(`${col},${row}`);
      cells.push({ kind: "vertex", id: idAt(i), col, row, label });
    } else if (rc.length === 4) {
      const [s, t, label, rawOptions] = rc;
      // Endpoints must refer to earlier cells (topological order).
      if (!isInt(s) || !isInt(t) || s < 0 || t < 0 || s >= i || t >= i) return invalid(`${where}: bad endpoints`);
      if (typeof label !== "string") return invalid(`${where}: label must be text`);
      if (s === t && cells[s]?.kind === "edge") return invalid(`${where}: an arrow cannot loop on an arrow`);
      const options = decodeOptions(rawOptions, where);
      if (!options.ok) return options;
      cells.push({ kind: "edge", id: idAt(i), source: idAt(s), target: idAt(t), label, options: options.value });
    } else {
      return invalid(`${where} has the wrong shape`);
    }
  }
  return ok({ cellSize, colors: colors.value, cells, nextId: cells.length + 1 });
};

// ---------------------------------------------------------------------------
// JSON (autosave)
// ---------------------------------------------------------------------------

export const encodeJson = (d: Diagram): string => JSON.stringify(toCompact(d));

export const decodeJson = (text: string): Result<Diagram, DecodeError> => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return err({ kind: "invalid-json" });
  }
  return fromCompact(raw);
};

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

const LINK_PREFIX = "#d=";

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, ch => ch.charCodeAt(0));
};

const pipeBytes = async (bytes: Uint8Array, transform: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(transform)).arrayBuffer());

/** The URL hash (including `#d=`) encoding this diagram. */
export const encodeLinkHash = async (d: Diagram): Promise<string> => {
  const json = new TextEncoder().encode(encodeJson(d));
  return LINK_PREFIX + toBase64Url(await pipeBytes(json, new CompressionStream("deflate-raw")));
};

/** True if a URL hash looks like a share link (whether or not it is valid). */
export const isLinkHash = (hash: string): boolean => hash.startsWith(LINK_PREFIX);

export const decodeLinkHash = async (hash: string): Promise<Result<Diagram, DecodeError>> => {
  let text: string;
  try {
    const bytes = await pipeBytes(fromBase64Url(hash.slice(LINK_PREFIX.length)), new DecompressionStream("deflate-raw"));
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return err({ kind: "malformed-link" });
  }
  return decodeJson(text);
};
