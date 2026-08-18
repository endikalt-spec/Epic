import { useEffect, useRef } from "react";

// Accessibility for overlays (drawer / modal / menu):
//  - moves focus into the overlay when it opens,
//  - traps Tab / Shift+Tab within it,
//  - closes on Escape,
//  - restores focus to the trigger element on close.
// Returns a ref to attach to the overlay's root element.
export function useFocusTrap(active, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const previouslyFocused = document.activeElement;
    const selector = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(node.querySelectorAll(selector)).filter((el) => el.offsetParent !== null);

    // Focus the first control (or the container) once open.
    const first = focusables()[0];
    (first || node).focus?.();

    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose?.(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const active = document.activeElement;
      const idx = f.indexOf(active);
      if (e.shiftKey) {
        if (idx <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      } else if (idx === f.length - 1 || idx === -1) {
        e.preventDefault(); f[0].focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [active, onClose]);
  return ref;
}
