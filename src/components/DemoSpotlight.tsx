// ============================================================================
// DemoSpotlight — the ONE spotlight-plus-tooltip implementation used by the
// scripted Classic demo. Every step lights exactly one region with it: the
// region keeps full opacity, everything else dims, and the region that owns the
// step's copy also renders the tooltip, which points back at it with an arrow.
//
// Dimming is done per region with opacity rather than with a scrim, so nothing
// changes size or position between steps — the board never shifts under the
// player while they read.
// ============================================================================

import React from "react";
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

const DemoSpotlight: React.FC<DemoSpotlightProps> = ({
  active,
  tooltip,
  placement = "bottom",
  style,
  children,
}) => {
  const below = placement === "bottom";
  return (
    <div
      style={{
        position: "relative",
        ...style,
        zIndex: active ? 5 : 0,
        opacity: active ? 1 : DEMO_DIM_OPACITY,
        transition: `opacity ${MOTION.base}`,
      }}
    >
      {children}

      {active && tooltip ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...panelStyle("panel", 6),
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            ...(below
              ? { top: `calc(100% + ${SPACE[5]}px)` }
              : { bottom: `calc(100% + ${SPACE[5]}px)` }),
            width: `min(300px, calc(100vw - ${SPACE[16]}px))`,
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
              left: "50%",
              marginLeft: -ARROW / 2,
              width: ARROW,
              height: ARROW,
              background: COLORS.panel,
              boxSizing: "border-box",
              transform: "rotate(45deg)",
              ...(below
                ? {
                    top: -ARROW / 2,
                    borderTop: BORDER.heavy,
                    borderLeft: BORDER.heavy,
                  }
                : {
                    bottom: -ARROW / 2,
                    borderBottom: BORDER.heavy,
                    borderRight: BORDER.heavy,
                  }),
            }}
          />
        </div>
      ) : null}
    </div>
  );
};

export default DemoSpotlight;
