import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

// The About entry animation is its own editorial treatment: a long, eased rise
// — not the snappy 250ms in-app UI beat shared by panels and modals.
describe("editorial scroll reveal", () => {
  it("uses the dedicated slow reveal, not the shared UI entry beat", () => {
    const component = read("components/MotionReveal.tsx");
    expect(component).toContain('className={["ww-scroll-reveal-in"');
    expect(component).not.toContain('className={["ww-ui-section-in"');
  });

  it("runs long with a deep ease-out and real travel", () => {
    const timing = read("lib/animationTiming.ts");
    expect(timing).toContain("SCROLL_REVEAL_MS = 760");
    expect(timing).toContain("SCROLL_REVEAL_DISTANCE_PX = 26");
    expect(timing).toContain('SCROLL_REVEAL_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"');
    expect(timing).toContain("SCROLL_REVEAL_STAGGER_MS = 90");
  });

  it("defines the keyframes with the same values, and a reduced-motion fade", () => {
    const css = read("index.css");
    expect(css).toContain("@keyframes ww-scroll-reveal");
    expect(css).toContain(".ww-scroll-reveal-in");
    // Reduced motion: plain fade, no travel.
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain(".ww-scroll-reveal-in");
  });
});
