import { DIE_ART } from "@/lib/assetUrls";
// ============================================================================
// MatchDie — a CSS 3D cube representing the match die. Six faces on a
// preserve-3d wrapper with perspective. No Three.js, no physics.
//
// Face pairing (opposite faces share an attribute — each attribute has
// exactly two clean landing rotations, both showing the SAME artwork):
//   SHAPE   → front (faceIndex 0) / back (faceIndex 1)   → match-shape.svg
//   NUMBER  → right (faceIndex 0) / left (faceIndex 1)   → match-number.svg
//   COLOR   → top   (faceIndex 0) / bottom (faceIndex 1) → match-color.svg
//
// Face artwork is a supplied SVG with the "Match the …" lettering already
// outlined into the paths. The die no longer depends on the Friend font.
// ============================================================================

import { CSSProperties } from "react";
import { RAW } from "@/lib/tokens";
import type { RollAttribute } from "@/lib/multiplayer";

export interface MatchDieProps {
  size: number;
  attribute: RollAttribute;
  faceIndex: 0 | 1;
  // Optional override for the cube transform. When provided, replaces the
  // derived landed rotation — used by the roll-hero overlay to drive tumble.
  rotation?: string;
  // Optional CSS transition applied to the cube. Only used by the overlay;
  // for static renders leave undefined to keep the die inert.
  transition?: string;
}

type FaceKey = "front" | "back" | "right" | "left" | "top" | "bottom";

// Face placement — where each face sits on the cube. translateZ(size/2) pushes
// the face out to the cube surface; the rotate before it orients the face.
function facePlacement(key: FaceKey, size: number): string {
  const half = size / 2;
  switch (key) {
    case "front":  return `rotateY(0deg) translateZ(${half}px)`;
    case "back":   return `rotateY(180deg) translateZ(${half}px)`;
    case "right":  return `rotateY(90deg) translateZ(${half}px)`;
    case "left":   return `rotateY(-90deg) translateZ(${half}px)`;
    case "top":    return `rotateX(90deg) translateZ(${half}px)`;
    case "bottom": return `rotateX(-90deg) translateZ(${half}px)`;
  }
}

// Landed cube rotation as (x,y) degrees — decomposed so callers can add full
// spin turns without CSS matrix decomposition collapsing them.
export function landedComponentsFor(
  attribute: RollAttribute,
  faceIndex: 0 | 1,
): { x: number; y: number } {
  if (attribute === "SHAPE")  return { x: 0,   y: faceIndex === 0 ? 0   : -180 };
  if (attribute === "NUMBER") return { x: 0,   y: faceIndex === 0 ? -90 :   90 };
  /* COLOR */                 return { x: faceIndex === 0 ? -90 : 90, y: 0 };
}

// Landed cube rotation — chosen so the target face ends up facing the camera.
export function landedRotationFor(attribute: RollAttribute, faceIndex: 0 | 1): string {
  const { x, y } = landedComponentsFor(attribute, faceIndex);
  return `rotateX(${x}deg) rotateY(${y}deg)`;
}

// Which artwork each face shows. Opposite faces share an attribute AND asset.
const FACE_ATTR: Record<FaceKey, RollAttribute> = {
  front: "SHAPE",  back:   "SHAPE",
  right: "NUMBER", left:   "NUMBER",
  top:   "COLOR",  bottom: "COLOR",
};

export const MATCH_ART_SRC: Record<RollAttribute, string> = {
  SHAPE:  DIE_ART.SHAPE,
  NUMBER: DIE_ART.NUMBER,
  COLOR:  DIE_ART.COLOR,
};

const FACES: FaceKey[] = ["front", "back", "right", "left", "top", "bottom"];

export function MatchDie({ size, attribute, faceIndex, rotation, transition }: MatchDieProps) {
  const sceneStyle: CSSProperties = {
    width: size,
    height: size,
    perspective: 420,
    perspectiveOrigin: "50% 50%",
  };

  const cubeStyle: CSSProperties = {
    position: "relative",
    width: size,
    height: size,
    transformStyle: "preserve-3d",
    transform: rotation ?? landedRotationFor(attribute, faceIndex),
    transition,
    willChange: transition ? "transform" : undefined,
  };

  const faceBaseStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: size,
    height: size,
    backgroundColor: RAW.cream,   // #F8F2E9
    border: `2px solid ${RAW.warmBlack}`, // #231F20
    borderRadius: 8,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    userSelect: "none",
    overflow: "hidden",
  };

  return (
    <div style={sceneStyle} aria-label={`Match die showing ${attribute}`}>
      <div style={cubeStyle}>
        {FACES.map((key) => {
          const attr = FACE_ATTR[key];
          return (
            <div
              key={key}
              style={{
                ...faceBaseStyle,
                transform: facePlacement(key, size),
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  padding: "14%",
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={MATCH_ART_SRC[attr]}
                  alt=""
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                    pointerEvents: "none",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MatchDie;
