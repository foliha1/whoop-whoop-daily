import { cardArt } from "@/lib/assetUrls";
import React from "react";
import { CARD_BACK_PATH } from "@/cardData";
import { COLORS, RADIUS, SHADOW, SPACE } from "@/lib/tokens";

const FACE_SRC = cardArt("1-star-red");

const faceLayer: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  borderRadius: RADIUS.md,
  overflow: "hidden",
  boxShadow: SHADOW.card,
};

type CardFlipLoaderProps = {
  label: string;
  layout?: "overlay" | "page" | "inline";
};

/** The same branded flip for Classic, page chunks, and in-page data reads. */
const CardFlipLoader: React.FC<CardFlipLoaderProps> = ({ label, layout = "inline" }) => (
  <div
    role="status"
    aria-label={label}
    style={{
      ...(layout === "overlay" ? { position: "absolute", inset: 0 } : {}),
      width: "100%",
      minHeight: layout === "page" ? "var(--ww-vh)" : layout === "inline" ? SPACE[20] * 4 : undefined,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.surface,
    }}
  >
    <div style={{ width: SPACE[20] * 2 + SPACE[4], aspectRatio: "5/7", perspective: 600 }}>
      <div className="ww-loading-flip" style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d" }}>
        <div style={faceLayer}>
          <img src={CARD_BACK_PATH} alt="" aria-hidden="true" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ ...faceLayer, transform: "rotateY(180deg)" }}>
          <img src={FACE_SRC} alt="" aria-hidden="true" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      </div>
    </div>
  </div>
);

export default CardFlipLoader;