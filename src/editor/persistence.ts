/**
 * Browser-side persistence: autosave to localStorage and share links in the
 * URL hash. Diagrams are deliberately *not* embedded in exported images.
 *
 * Storage can be unavailable (private windows, blocked site data) or full, so
 * every access is guarded and failures come back as enumerated errors.
 */
import { err, ok, type Result } from "../lib/result";
import { decodeJson, decodeLinkHash, encodeJson, encodeLinkHash, isLinkHash, type DecodeError } from "../model/codec";
import type { Diagram } from "../model/types";

const STORAGE_KEY = "cat-builder:diagram";

export type StorageError = "storage-unavailable" | "quota-exceeded";

/** The autosaved diagram, null if there is none, or why it could not be read. */
export const loadAutosave = (): Result<Diagram | null, StorageError | DecodeError> => {
  let text: string | null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch {
    return err("storage-unavailable");
  }
  if (text === null) return ok(null);
  return decodeJson(text);
};

export const saveAutosave = (d: Diagram): Result<void, StorageError> => {
  try {
    localStorage.setItem(STORAGE_KEY, encodeJson(d));
    return ok(undefined);
  } catch (e) {
    return err(e instanceof DOMException && e.name === "QuotaExceededError" ? "quota-exceeded" : "storage-unavailable");
  }
};

export const describeStorageError = (e: StorageError): string =>
  e === "quota-exceeded"
    ? "Autosave failed: browser storage is full."
    : "Autosave is unavailable (browser storage is blocked), so work is not kept between visits.";

/** A link that opens this diagram. */
export const shareUrl = async (d: Diagram): Promise<string> => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${await encodeLinkHash(d)}`;
};

/** The diagram in the current URL's hash: null if there is no share link. */
export const readSharedDiagram = async (): Promise<Result<Diagram, DecodeError> | null> => {
  const hash = window.location.hash;
  return isLinkHash(hash) ? decodeLinkHash(hash) : null;
};

/**
 * Drop the share link from the address bar once it has been loaded, so that
 * reloading shows the (autosaved) current work rather than the original link.
 */
export const clearHash = (): void => {
  const { pathname, search } = window.location;
  history.replaceState(null, "", pathname + search);
};
