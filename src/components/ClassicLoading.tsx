import React from "react";
import { COLORS, RADIUS, SHADOW } from "@/lib/tokens";
import { CARD_BACK_PATH } from "@/cardData";

/**
 * Branded loading screen for the Classic route's lazy chunks: a game card
 * flipping back and forth (see `ww-loading-flip` in index.css) instead of a
 * bare "Loading…" line. Reduced-motion users get the static card back.
 */
const FACE_SRC = "/cards/1-star-red.svg";

const faceLayer: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  borderRadius: RADIUS.md,
  overflow: "hidden",
  boxShadow: SHADOW.card,
};

const ClassicLoading: React.FC = () => (
  <div
    role="status"
    aria-label="Loading WHOOP! WHOOP! Classic"
    style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      backgroundColor: COLORS.surface,
    }}
  >
    <div style={{ width: 88, aspectRatio: "5/7", perspective: 600 }}>
      <div className="ww-loading-flip" style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d" }}>
        {/* Card back — visible at rest */}
        <div style={faceLayer}>
          <img src={CARD_BACK_PATH} alt="" aria-hidden="true" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        {/* Card face — revealed by the flip */}
        <div style={{ ...faceLayer, transform: "rotateY(180deg)" }}>
          <img src={FACE_SRC} alt="" aria-hidden="true" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      </div>
    </div>
  </div>
);

export default ClassicLoading;
