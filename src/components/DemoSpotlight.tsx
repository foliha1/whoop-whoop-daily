// ============================================================================
// DemoSpotlight — the ONE spotlight-plus-tooltip implementation used by the
// scripted Classic demo. Every step lights exactly one region with it: the
// region keeps full opacity, everything else dims, and the region that owns the
// step's copy is rendered once in ClassicDemo's fixed bubble slot.
//
// Dimming is done per region with opacity rather than with a scrim, so nothing
// changes size or position between steps — the board never shifts under the
// player while they read.
//
// Keeping copy out of this wrapper means the board geometry is identical on
// every step. Only opacity and stacking change here.
// ============================================================================

import React from "react";
import { MOTION } from "@/lib/tokens";

/** Opacity of everything that is not the element being discussed. */
export const DEMO_DIM_OPACITY = 0.22;

export interface DemoSpotlightProps {
  /** True while this region is the element being discussed. */
  active: boolean;
  /** Reduced motion: the dim still applies, it just arrives without easing. */
  instant?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const DemoSpotlight: React.FC<DemoSpotlightProps> = ({
  active,
  instant = false,
  style,
  children,
}) => {
  return (
    <div
      style={{
        position: "relative",
        ...style,
        zIndex: active ? 5 : 0,
        opacity: active ? 1 : DEMO_DIM_OPACITY,
        transition: instant ? undefined : `opacity ${MOTION.base}`,
      }}
    >
      {children}
    </div>
  );
};


export default DemoSpotlight;
