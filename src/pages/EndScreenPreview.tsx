// TEMPORARY verification page for the multiplayer end screen (six seats).
// Debug-gated route; delete after verification.
import React from "react";
import { EndScreen, type DerivedChip } from "@/components/MultiplayerGameView";
import { COLORS } from "@/lib/tokens";

const chips: DerivedChip[] = [
  { kind: "IDLE", name: "FELIX", score: 10, seat: 0 },
  { kind: "IDLE", name: "MIA", score: 8, seat: 1 },
  { kind: "IDLE", name: "JO", score: 8, seat: 2 },
  { kind: "IDLE", name: "ZED", score: 5, seat: 3 },
  { kind: "IDLE", name: "ANA", score: 3, seat: 4 },
  { kind: "IDLE", name: "BO", score: 0, seat: 5 },
];
const scores = [10, 8, 8, 5, 3, 0];

const EndScreenPreview: React.FC = () => (
  <div style={{ position: "relative", height: "var(--ww-vh)", background: COLORS.panel }}>
    <EndScreen
      chips={chips}
      scores={scores}
      canRematch
      onPlayAgain={() => {}}
      onLeave={() => {}}
      mobile
    />
  </div>
);

export default EndScreenPreview;
