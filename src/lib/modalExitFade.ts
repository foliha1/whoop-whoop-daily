// ============================================================================
// modalExitFade.ts — every modal and its overlay fades out when it closes.
//
// Most modals here are mounted with `{open && <Modal />}`, so closing removes
// them from the page in one frame. Rather than rework every modal and every
// caller, this watches for a modal leaving the page and puts the very same
// (now detached) node back for a short fade, then removes it for good.
//
// React no longer owns a node once it has removed it, so re-adding it is safe:
// React never touches it again. The ghost is inert, ignores clicks and is
// hidden from screen readers, so it can't trap focus or block the next tap.
//
// Skipped:
//   - modals that already ran their own exit (data-motion-exit="true", an
//     inline opacity of 0, or a Radix data-state="closed"),
//   - anything that isn't a fixed overlay (an in-flow element would hold its
//     space for a beat and shift the layout).
// ============================================================================

const EXIT_MS = 200;
const REDUCED_EXIT_MS = 120;
const DIALOG = '[role="dialog"], [aria-modal="true"]';

let installed = false;

function isModalRoot(el: Element): boolean {
  if (el.matches(DIALOG)) return true;
  // The common shape: a backdrop wrapper whose direct child is the dialog.
  for (const child of Array.from(el.children)) if (child.matches(DIALOG)) return true;
  return false;
}

function alreadyExited(el: HTMLElement): boolean {
  if (el.closest?.('[data-motion-exit="true"], [data-state="closed"]')) return true;
  if (el.querySelector('[data-motion-exit="true"], [data-state="closed"]')) return true;
  if (el.style.opacity === "0") return true;
  for (const child of Array.from(el.children)) {
    if ((child as HTMLElement).style?.opacity === "0") return true;
  }
  return false;
}

function isFixedOverlay(el: HTMLElement): boolean {
  const own = getComputedStyle(el).position;
  if (own === "fixed") return true;
  const first = el.firstElementChild as HTMLElement | null;
  return !!first && getComputedStyle(first).position === "fixed";
}

function ghost(node: HTMLElement, parent: Node, next: Node | null): void {
  if (!parent.isConnected) return;
  if (alreadyExited(node)) return;

  try {
    parent.insertBefore(node, next && next.parentNode === parent ? next : null);
  } catch {
    return;
  }
  // Freeze CSS animations first: a re-added node would otherwise replay its
  // entry animation from the start.
  node.classList.add("ww-exit-ghost");
  if (!isFixedOverlay(node)) {
    node.remove();
    return;
  }
  node.setAttribute("inert", "");
  node.setAttribute("aria-hidden", "true");
  node.style.pointerEvents = "none";

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const ms = reduced ? REDUCED_EXIT_MS : EXIT_MS;
  const ease = "cubic-bezier(0.23, 1, 0.32, 1)";

  let fade: Animation | null = null;
  try {
    fade = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease-out", fill: "forwards" });
    const panel = node.matches(DIALOG) ? null : (node.querySelector(DIALOG) as HTMLElement | null);
    if (panel && !reduced) {
      panel.animate([{ transform: "scale(1)" }, { transform: "scale(0.96)" }], { duration: ms, easing: ease, fill: "forwards" });
    }
  } catch {
    fade = null;
  }

  const done = () => node.remove();
  if (fade) {
    fade.onfinish = done;
    fade.oncancel = done;
  }
  // Belt and braces: the ghost never outlives its fade by more than a beat.
  window.setTimeout(done, ms + 100);
}

export function installModalExitFade(): void {
  if (installed || typeof window === "undefined" || typeof MutationObserver === "undefined") return;
  if (typeof Element === "undefined" || !("animate" in Element.prototype)) return;
  installed = true;

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type !== "childList" || record.removedNodes.length === 0) continue;
      for (const removed of Array.from(record.removedNodes)) {
        if (!(removed instanceof HTMLElement)) continue;
        if (removed.classList.contains("ww-exit-ghost")) continue;
        if (!isModalRoot(removed)) continue;
        ghost(removed, record.target, record.nextSibling);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
