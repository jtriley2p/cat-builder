/**
 * Open/close state for a toolbar popover. It closes on a pointer press
 * outside the element holding `ref` (which should contain both the trigger
 * button and the panel), or on Escape.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const usePopover = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Keep Escape from also clearing the diagram selection (App listens on window).
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen(o => !o), []);
  return { open, toggle, ref } as const;
};
