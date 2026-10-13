/**
 * A minimal Result type used across the app so that expected failures
 * (invalid input, unsupported formats, malformed links, …) are returned as
 * values with an enumerated `error` rather than thrown.
 */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
