// ============================================================================
// DailyMatchGhost — the correct-match reward for the daily puzzle.
//
// The daily engine removes a solved pair from the board the instant it
// resolves, so the reward is played by copies rendered into a fixed layer
// pinned over the slots the pair just left. Sequence:
//
//   1. REVEAL  both copies flip face up (the pair the player found)
//   2. HOLD    a beat long enough to read them
//   3. GREAT   the existing multiplayer ghost treatment (.ww-great + wash /
//              shine / ring) which lifts, scales and fades the pair out
//
// Under prefers-reduced-motion the reveal and the hold stay; the ghost layer
// is skipped entirely and the slots simply end up empty.
//
// The clock and the card markup live in matchGhostParts so How to Play can
// play the identical treatment.
// ============================================================================

import React from "react";
import type { Card } from "@/cardData";
import { MatchGhostCard, useMatchGhostStage } from "@/components/matchGhostParts";

export interface GhostCard {
  key: string;
  card: Card;
  rect: { top: number; left: number; width: number; height: number };
}

const DailyMatchGhost: React.FC<{
  pair: GhostCard[];
  onDone: () => void;
  /** True when the pair is already face up (multiplayer): skips the flip. */
  startFaceUp?: boolean;
}> = ({ pair, onDone, startFaceUp = false }) => {
  const { stage, faceUp } = useMatchGhostStage(onDone, startFaceUp);

  if (pair.length === 0) return null;

  return (
    <div
      aria-hidden
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40 }}
    >
      {pair.map((g) => (
        <MatchGhostCard
          key={g.key}
          card={g.card}
          stage={stage}
          faceUp={faceUp}
          k={g.rect.width / 104.333}
          style={{
            position: "absolute",
            top: g.rect.top,
            left: g.rect.left,
            width: g.rect.width,
            height: g.rect.height,
          }}
        />
      ))}
    </div>
  );
};

export default DailyMatchGhost;
