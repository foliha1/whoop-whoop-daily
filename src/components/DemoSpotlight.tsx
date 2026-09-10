// ============================================================================
// DemoSpotlight — the ONE spotlight-plus-tooltip implementation used by the
// scripted Classic demo. Every step lights exactly one region with it: the
// region keeps full opacity, everything else dims, and the region that owns the
// step's copy also renders the tooltip, which points back at it with an arrow.
//
// Dimming is done per region with opacity rather than with a scrim, so nothing
// changes size or position between steps — the board never shifts under the
// player while they read.
//
// The tooltip is centred on its region and then clamped inside the viewport, so
// a region at the very edge of a 390px screen (the die, the call button) still
// gets a full-width tooltip. The arrow stays on the region, not on the
// tooltip's centre, so it keeps pointing at the thing being discussed.
// ============================================================================

import React, { useEffect, useState } from "react";
import { BORDER, COLORS, MOTION, RADIUS, SPACE, panelStyle, textStyle } from "@/lib/tokens";

/** Opacity of everything that is not the element being discussed. */
export const DEMO_DIM_OPACITY = 0.22;

export type SpotPlacement = "top" | "bottom";

export interface DemoSpotlightProps {
  /** True while this region is the element being discussed. */
  active: boolean;
  /** Step copy. Only the region that owns the copy passes it. */
  tooltip?: React.ReactNode;
  /** Which side of the region the tooltip sits on. */
  placement?: SpotPlacement;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const ARROW = 12;
const MAX_W = 300;
const EDGE = SPACE[4];

const DemoSpotlight: React.FC<DemoSpotlightProps> = ({
  active,
  tooltip,
  placement = "bottom",
  style,
  children,
}) => {
  const below = placement === "bottom";
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [shift, setShift] = useState(0);
  const show = active && !!tooltip;

  useEffect(() => {
    if (!node || !show) return;
    const measure = () => {
      const vw = window.innerWidth;
      const box = node.getBoundingClientRect();
      const width = Math.min(MAX_W, vw - 2 * EDGE);
      const wanted = box.left + box.width / 2 - width / 2;
      const clamped = Math.min(Math.max(EDGE, wanted), vw - EDGE - width);
      setShift(Math.round(clamped - wanted));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [node, show]);

  return (
    <div
      ref={setNode}
      style={{
        position: "relative",
        ...style,
        zIndex: active ? 5 : 0,
        opacity: active ? 1 : DEMO_DIM_OPACITY,
        transition: `opacity ${MOTION.base}`,
      }}
    >
      {children}

      {show ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...panelStyle("panel", 6),
            position: "absolute",
            left: "50%",
            transform: `translateX(calc(-50% + ${shift}px))`,
            ...(below
              ? { top: `calc(100% + ${SPACE[5]}px)` }
              : { bottom: `calc(100% + ${SPACE[5]}px)` }),
            width: `min(${MAX_W}px, calc(100vw - ${2 * EDGE}px))`,
            borderRadius: RADIUS.sm,
            zIndex: 6,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              ...textStyle("caption", true),
              display: "block",
              textAlign: "center",
              whiteSpace: "pre-line",
              color: COLORS.ink,
            }}
          >
            {tooltip}
          </span>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `calc(50% - ${shift}px)`,
              marginLeft: -ARROW / 2,
              width: ARROW,
              height: ARROW,
              background: COLORS.panel,
              boxSizing: "border-box",
              transform: "rotate(45deg)",
              ...(below
                ? { top: -ARROW / 2, borderTop: BORDER.heavy, borderLeft: BORDER.heavy }
                : { bottom: -ARROW / 2, borderBottom: BORDER.heavy, borderRight: BORDER.heavy }),
            }}
          />
        </div>
      ) : null}
    </div>
  );
};

export default DemoSpotlight;
