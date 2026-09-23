// ============================================================================
// DailyMilestoneConfetti — one short burst for a 10-day streak milestone.
//
// Owns its own canvas so nothing else on the results screen is touched: the
// canvas is fixed, above the content, never intercepts taps, and is removed
// from the DOM once the burst has fallen (~3s).
//
// Reduced motion is handled by the caller (this component is not mounted at
// all), so there is no "quieter" variant here — none means none.
// ============================================================================

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { getBrandConfettiShapes } from "@/lib/confettiShapes";

/** Brand-only palette: blue, orange, red, warm black. */
const COLORS = ["#0072B2", "#E79024", "#D72229", "#231F20"];

export const BURST_LIFETIME_MS = 3000;
export const CONFETTI_Z_INDEX = 9999;

const DailyMilestoneConfetti: React.FC<{ delayMs?: number }> = ({ delayMs = 0 }) => {
  useEffect(() => {
    let canvas: HTMLCanvasElement | null = null;
    let instance: confetti.CreateTypes | null = null;
    let teardown: ReturnType<typeof setTimeout> | undefined;

    const start = setTimeout(() => {
      canvas = document.createElement("canvas");
      canvas.setAttribute("data-testid", "milestone-confetti");
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.position = "fixed";
      canvas.style.inset = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = String(CONFETTI_Z_INDEX);
      document.body.appendChild(canvas);

      instance = confetti.create(canvas, { resize: true, useWorker: false });
      // Circle / square / triangle from the brand pattern strip, built once.
      const shapes = getBrandConfettiShapes();
      // One burst, not a shower.
      void instance({
        particleCount: 90,
        spread: 70,
        startVelocity: 42,
        gravity: 1,
        ticks: 180,
        origin: { x: 0.5, y: 0.35 },
        colors: COLORS,
        shapes,
        disableForReducedMotion: true,
      });

      teardown = setTimeout(() => {
        instance?.reset();
        canvas?.remove();
        instance = null;
        canvas = null;
      }, BURST_LIFETIME_MS);
    }, delayMs);

    return () => {
      clearTimeout(start);
      if (teardown !== undefined) clearTimeout(teardown);
      instance?.reset();
      canvas?.remove();
    };
  }, [delayMs]);

  return null;
};

export default DailyMilestoneConfetti;
