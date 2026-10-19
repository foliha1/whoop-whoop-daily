import React from "react";
import {
  listEntryDelay,
  motionDelayStyle,
  sectionEntryDelay,
} from "@/lib/animationTiming";

type ScrollRevealProps = {
  index?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/**
 * Scroll-triggered variant of the standard section entry: the same
 * rise + fade keyframes (`ww-ui-section-in`), the same tokens, and the same
 * reduced-motion fallback (the `@media` rule in index.css already rewrites the
 * class to a plain fade). The animation runs once, the first time the block
 * scrolls into view; blocks already on screen at mount stagger by index.
 * While waiting, the paused animation holds its first frame, so hidden blocks
 * reserve their layout space and never flash.
 */
export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  index = 0,
  className,
  style,
  children,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setPlaying(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Intersecting now, or already scrolled past above the viewport
          // (e.g. the browser restored a mid-page scroll position).
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            setPlaying(true);
            io.disconnect();
            return;
          }
        }
      },
      // Fire a touch early, while the block is still just entering the fold.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={["ww-ui-section-in", className].filter(Boolean).join(" ")}
      style={{
        ...motionDelayStyle(sectionEntryDelay(index)),
        animationPlayState: playing ? "running" : "paused",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

type MotionRevealProps = {
  kind?: "section" | "list" | "small";
  index?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/** Layout-neutral presentation wrapper. Children are interactive from mount. */
const MotionReveal: React.FC<MotionRevealProps> = ({
  kind = "section",
  index = 0,
  className,
  style,
  children,
}) => {
  const small = kind === "small";
  const delay = kind === "list" ? listEntryDelay(index) : sectionEntryDelay(index);
  const motionClass = small ? "ww-ui-small-in" : kind === "list" ? "ww-ui-list-in" : "ww-ui-section-in";
  return (
    <div
      className={[motionClass, className].filter(Boolean).join(" ")}
      style={{
        ...motionDelayStyle(delay, small ? "--ww-small-delay" : "--ww-ui-delay"),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default MotionReveal;