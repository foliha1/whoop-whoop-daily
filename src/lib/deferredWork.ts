/** Run non-critical work after paint, or on the first real interaction. */
export function afterPaintIdleOrInteraction(work: () => void): () => void {
  let done = false;
  let idleId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

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
    if (timerId !== null) clearTimeout(timerId);
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
/**
 * Run work once the first real content has painted, then the browser is idle.
 * Use it for prefetches and warm-ups that would otherwise compete with the
 * page's own code and images for bandwidth on a slow phone connection.
 * A real interaction runs it right away. A fallback timer makes sure it runs.
 */
export function afterFirstContent(work: () => void, fallbackMs = 6000): () => void {
  let done = false;
  let idleId: number | null = null;
  let observer: PerformanceObserver | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const run = () => {
    if (done) return;
    done = true;
    cleanup();
    work();
  };
  const runWhenIdle = () => {
    if (done) return;
    if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(run, { timeout: 2000 });
    else timers.push(globalThis.setTimeout(run, 300));
  };
  const cleanup = () => {
    window.removeEventListener("pointerdown", run, true);
    window.removeEventListener("keydown", run, true);
    observer?.disconnect();
    if (idleId !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
    for (const t of timers) clearTimeout(t);
  };

  window.addEventListener("pointerdown", run, { capture: true, once: true });
  window.addEventListener("keydown", run, { capture: true, once: true });
  timers.push(globalThis.setTimeout(run, fallbackMs));
  try {
    observer = new PerformanceObserver((list) => {
      if (list.getEntries().some((e) => e.name === "first-contentful-paint")) runWhenIdle();
    });
    observer.observe({ type: "paint", buffered: true });
  } catch {
    // No paint timing (older Safari): the fallback timer covers it.
  }
  return cleanup;
}
