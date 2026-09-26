/** Run non-critical work after paint, or on the first real interaction. */
export function afterPaintIdleOrInteraction(work: () => void): () => void {
  let done = false;
  let idleId: number | null = null;
  let timerId: number | null = null;

  const run = () => {
    if (done) return;
    done = true;
    cleanup();
    work();
  };
  const cleanup = () => {
    window.removeEventListener("pointerdown", run, true);
    window.removeEventListener("keydown", run, true);
    if (idleId !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
    if (timerId !== null) window.clearTimeout(timerId);
  };

  window.addEventListener("pointerdown", run, { capture: true, once: true });
  window.addEventListener("keydown", run, { capture: true, once: true });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (done) return;
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(run, { timeout: 1500 });
      else timerId = globalThis.setTimeout(run, 250);
    });
  });
  return cleanup;
}