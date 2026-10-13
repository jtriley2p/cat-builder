/** Platform-specific names for keyboard shortcuts, for help text and hints. */

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The command modifier: "⌘" on Apple platforms, "Ctrl+" elsewhere. */
export const MOD = isMac ? "⌘" : "Ctrl+";
/** The option/alt modifier. */
export const ALT = isMac ? "⌥" : "Alt+";
export const UNDO_SHORTCUT = `${MOD}Z`;
