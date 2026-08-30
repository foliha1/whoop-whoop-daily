// ============================================================================
// MultiplayerGameView — prompt 12b, Figma-accurate multiplayer surface.
//
// Rendering-only. All state comes from PublicState + the transient event
// stream. No reducer touches, no new tokens. Pixel values below are
// transcribed from the Figma spec at a 385px content column; card grid uses
// aspect-ratio so it scales gracefully on narrower phones without changing
// the ratio.
//
// Chip state derivation is deterministic:
//   claimBy === seat           → WHOOP!  (arbiter grant is authoritative)
//   event GREAT_MATCH on seat  → NICE!  (transient, 1.4s window)
//   disconnected[seat]         → GONE   (see report — invented state)
//   AWAITING_ROLL && roller    → ROLLING!
//   FLIPPING     && flipper    → FLIPPING
//   otherwise                  → idle
// Precedence is top-down so a claim winner reads WHOOP! even if they were
// also the flipper the moment before.
//
// TOO SLOW! chip state is included in the style map but does not fire on
// opponent chips in normal flow — the arbiter's `won:false` is a local-only
// signal to the loser (see multiplayer.ts). The design system carries the
// state; the game currently only surfaces it on the SELF banner.
// ============================================================================

import React, { useEffect, useState } from "react";
import { Settings, X } from "lucide-react";
import SettingsSheet from "@/components/SettingsSheet";
import { MOBILE_SHELL_PAD } from "@/lib/layout";
import SiteHeader, { SITE_HEADER_H } from "@/components/SiteHeader";
import GameCard from "@/components/GameCard";
import { COLORS, FONT_FAMILY, RAW } from "@/lib/tokens";
import type { PublicState } from "@/lib/publicState";
import type { IntentAction, RollAttribute, RollCommitPayload, TransientEvent } from "@/lib/multiplayer";
import { ROLL_HERO_MS } from "@/lib/multiplayer";
import {
  GREAT_MATCH_DELAY_MS, DEAL_MOVE_MS,
  applyAnimationTimingVars,
} from "@/lib/animationTiming";
import { serverNow } from "@/hooks/useServerClock";
import { TARGET_SCORE } from "@/hooks/useGameState";

import RollHeroOverlay from "@/components/RollHeroOverlay";
import { MATCH_ART_SRC } from "@/components/MatchDie";
import type { Card } from "@/cardData";
import { preloadGameArt } from "@/lib/preloadArt";
import { callClaimLock } from "@/lib/claimLock";
import {
  playFlip, playDiceRoll, playWhoopCall, playCorrect, playWrong, playDeal,
  unlockAudio,
} from "@/lib/sounds";
import AutoFitText from "@/components/AutoFitText";
import { hapticTap, hapticImpact, hapticSuccess, hapticError } from "@/lib/haptics";

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

interface Props {
  publicState: PublicState;
  mySeat: number | null; // null = spectator
  events?: TransientEvent[];
  // Latest server-committed roll. Drives the hero overlay when its window
  // ([startAt, startAt + ROLL_HERO_MS]) is still live on the server clock.
  rollCommit?: RollCommitPayload | null;
  // Latest host-emitted claim rejection (window mismatch). When its seat
  // matches mySeat, the pressing player sees CONNECTION ISSUE — TRY AGAIN
  // instead of a silently stuck LOCKING… state.
  lastClaimReject?: { seat: number; grant_claim_window: number; host_claim_window: number; reason: string } | null;
  onIntent: (a: IntentAction) => void;
  onLeave: () => void;
  mobile?: boolean;
  roomId: string;
  visitorId: string;
  isHost: boolean;
  // Live list of visitor_ids currently present via Realtime Presence.
  // Diagnostic-only: used by the ?debug=1 overlay to compute the client's
  // view of disconnectedSeats independent of the reducer.
  presenceVisitorIds?: string[];
  // Diagnostic-only: heartbeat-derived seat sets. The overlay displays the
  // breakdown so testers do not confuse presence-only absence with the union
  // the host actually dispatches to the reducer.
  heartbeatStale?: number[];
  awaySkip?: number[];
  hostDisconnectedSeats?: number[];
  // When not "connected" AND a game is in progress, an overlay Reconnecting…
  // banner covers the board. Purely visual — no phase change, no gate.
  presenceStatus?: "connecting" | "connected" | "error";
  // Solo bypass: when true, WHOOP dispatches PLAYER_ENTER_CLAIM through
  // onIntent instead of hitting the (nonexistent) claim-lock arbiter.
  soloMode?: boolean;
}

// -------- Figma-transcribed constants --------
const INK = COLORS.ink;               // #231F20
const SURFACE = COLORS.surface;       // #F8F2E9
const PANEL = COLORS.panel;           // #D0C3AF
const MUTED = COLORS.inkMuted;        // #544C4A
const RED = COLORS.red;               // #D72229
const BLUE = COLORS.blue;             // #0072B2
const ORANGE = COLORS.orange;         // #E79024
const GREEN = COLORS.success;         // #59CD90

const SEAT_COLORS = [RED, BLUE, ORANGE, GREEN, RAW.soloTint, RAW.peepsTint];

const R_CARD = 6.33043;

const R_BOX = 4;
const R_STRIP = 6.33043;
const BORDER_HEAVY = `2px solid ${INK}`;
const CARD_SHADOW = "0px 4px 4px rgba(0,0,0,0.25)";

type ChipKind =
  | "WHOOP"
  | "GREAT_MATCH"
  | "ROLLING"
  | "FLIPPING"
  | "PENALTY"
  | "GONE"
  | "DISCONNECTED"
  | "IDLE"
  | "EMPTY";

interface ChipStyle {
  bg: string; border: string; nameBg: string; nameBorder: string;
  name: string; badgeBg: string; badgeText: string;
  label: string; labelText: string | null; italic: boolean;
}

const CHIP: Record<ChipKind, ChipStyle> = {
  IDLE:         { bg: PANEL,  border: INK,   nameBg: SURFACE, nameBorder: INK,   name: INK,   badgeBg: INK,   badgeText: SURFACE, label: INK,     labelText: null,           italic: false },
  ROLLING:      { bg: ORANGE, border: INK,   nameBg: SURFACE, nameBorder: INK,   name: INK,   badgeBg: INK,   badgeText: SURFACE, label: INK,     labelText: "ROLLING",      italic: false },
  WHOOP:        { bg: RED,    border: INK,   nameBg: SURFACE, nameBorder: INK,   name: INK,   badgeBg: INK,   badgeText: SURFACE, label: SURFACE, labelText: "WHOOP WHOOP!", italic: true  },
  FLIPPING:     { bg: BLUE,   border: INK,   nameBg: SURFACE, nameBorder: INK,   name: INK,   badgeBg: INK,   badgeText: SURFACE, label: SURFACE, labelText: "FLIPPING",     italic: false },
  GREAT_MATCH:  { bg: GREEN,  border: INK,   nameBg: SURFACE, nameBorder: INK,   name: INK,   badgeBg: INK,   badgeText: SURFACE, label: INK,     labelText: "GREAT MATCH!", italic: true  },
  // Round-scoped wrong-claim lockout (v6.4).
  PENALTY:      { bg: RED,    border: RED,   nameBg: PANEL,   nameBorder: RED,   name: RED,   badgeBg: RED,   badgeText: PANEL,   label: PANEL,   labelText: "PENALTY",      italic: false },
  // GONE — heartbeat stale, seat presumed lost. Harsher than DISCONNECTED.
  GONE:         { bg: PANEL,  border: RED,   nameBg: SURFACE, nameBorder: RED,   name: RED,   badgeBg: RED,   badgeText: SURFACE, label: RED,     labelText: "GONE",         italic: false },
  // DISCONNECTED — self-reported backgrounded tab; gentler, takes precedence
  // over GONE so a reversible absence never reads as the harsher state.
  DISCONNECTED: { bg: MUTED,  border: MUTED, nameBg: PANEL,   nameBorder: MUTED, name: MUTED, badgeBg: MUTED, badgeText: PANEL,   label: PANEL,   labelText: "DISCONNECTED", italic: false },
  EMPTY:        { bg: PANEL,  border: MUTED, nameBg: PANEL,   nameBorder: MUTED, name: MUTED, badgeBg: MUTED, badgeText: PANEL,   label: MUTED,   labelText: null,           italic: false },
};

interface DerivedChip { kind: ChipKind; name: string; score: number | null; seat: number; }

// One chip per seat, in seat order, including the human seat (rendered as
// "YOU"). Seats the host reserved but nobody joined render as EMPTY.
function deriveChips(
  s: PublicState,
  mySeat: number | null,
  events: TransientEvent[],
  penaltySeat: number | null,
): DerivedChip[] {
  const great = new Set<number>();
  for (const e of events) if (e.kind === "GREAT_MATCH") great.add(e.seat);

  const out: DerivedChip[] = [];
  for (let seat = 0; seat < s.seatCount; seat++) {
    const entry = s.seatMap.find((e) => e.seat === seat);
    if (!entry) {
      out.push({ kind: "EMPTY", name: "---", score: 0, seat });
      continue;

    }
    let kind: ChipKind = "IDLE";
    if (s.awaySeats?.includes(seat)) kind = "DISCONNECTED";
    else if (s.disconnectedSeats.includes(seat)) kind = "GONE";
    else if (s.claimBy === seat) kind = "WHOOP";
    else if (great.has(seat)) kind = "GREAT_MATCH";
    else if (penaltySeat === seat) kind = "PENALTY";
    else if ((s.phase === "AWAITING_ROLL" && s.roller === seat) || (s.rolling && s.roller === seat)) kind = "ROLLING";
    else if (s.phase === "FLIPPING" && s.flipper === seat) kind = "FLIPPING";
    out.push({
      kind,
      name: seat === mySeat ? "YOU" : entry.display_name,
      score: s.scores[seat] ?? 0,
      seat,
    });

  }
  return out;
}

// -------- Small building blocks --------

const ChipCell: React.FC<{ chip: DerivedChip }> = ({ chip }) => {
  const c = CHIP[chip.kind];
  return (
    <div
      role="group"
      aria-label={`${chip.name}${c.labelText ? ` — ${c.labelText}` : ""}`}
      style={{
        display: "flex", flexDirection: "row", alignItems: "stretch",
        padding: 0, height: 22, borderRadius: 4, minWidth: 0,
        background: c.bg, border: `2px solid ${c.border}`,
        boxSizing: "border-box", overflow: "hidden",
      }}
    >
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 8px", flex: "1 1 0", minWidth: 0,
        background: c.nameBg, borderRight: `2px solid ${c.border}`,
        boxSizing: "border-box",
      }}>
        <AutoFitText minScale={0.8} style={{
          margin: "0 auto", flex: "1 1 0", minWidth: 0, textAlign: "center",
          fontFamily: FONT_FAMILY, fontSize: 14, lineHeight: 1,
          letterSpacing: "0.04em", color: c.name,
        }}>{chip.name}</AutoFitText>
        {chip.score !== null && (
          <span style={{
            margin: "0 auto", display: "flex", flexDirection: "column",
            justifyContent: "center", alignItems: "center",
            borderRadius: 2, padding: 2, height: 14, width: "auto",
            flexShrink: 0, background: c.badgeBg, boxSizing: "border-box",
          }}>
            <span style={{
              fontFamily: FONT_FAMILY, fontSize: 14, lineHeight: 1,
              letterSpacing: "0.02em", textAlign: "center", color: c.badgeText,
            }}>{chip.score}</span>
          </span>
        )}
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 8px", flex: "1 1 0", minWidth: 0,
        background: "transparent", boxSizing: "border-box",
      }}>
        {c.labelText && (
          <AutoFitText minScale={0.7} style={{
            margin: "0 auto", fontFamily: FONT_FAMILY, fontSize: 12, lineHeight: 1,
            letterSpacing: "0.04em", color: c.label,
            fontStyle: c.italic ? "italic" : "normal",
          }}>{c.labelText}</AutoFitText>
        )}
      </div>
    </div>
  );
};

// Two-column grid — grows from one row to three as seats fill. No fixed
// height, so the card area (flex: 1 1 0) reclaims the space on small screens.
const OpponentRow: React.FC<{ chips: DerivedChip[] }> = ({ chips }) => (
  <div style={{
    display: "grid", gridTemplateColumns: "1fr 1fr",
    columnGap: 8, rowGap: 4, padding: 8, flex: "none",
    background: PANEL, border: BORDER_HEAVY, borderRadius: 4,
    boxSizing: "border-box",
  }}>
    {chips.map((c, i) => <ChipCell key={i} chip={c} />)}
  </div>
);


// -------- End screen --------
// Presentation only. Covers the card area when the engine reports GAME_OVER.
// Standings reuse ChipCell: winner in GREAT_MATCH green, everyone else IDLE.
const EndScreen: React.FC<{
  chips: DerivedChip[];
  scores: number[];
  names: string[];
  canRematch: boolean;
  onPlayAgain: () => void;
  onLeave: () => void;
}> = ({ chips, scores, canRematch, onPlayAgain, onLeave }) => {
  const seats = chips
    .map((c, seat) => ({ chip: c, seat, score: scores[seat] ?? 0 }))
    .filter((e) => e.chip.kind !== "EMPTY");
  const top = seats.reduce((m, e) => Math.max(m, e.score), -Infinity);
  const winners = seats.filter((e) => e.score === top);
  const headline =
    winners.length !== 1
      ? "It's a draw!"
      : winners[0].chip.name === "YOU"
        ? "You win!"
        : `${winners[0].chip.name} wins!`;
  const ordered = seats.slice().sort((a, b) => b.score - a.score);

  const btn = (bg: string, fg: string): React.CSSProperties => ({
    all: "unset", cursor: "pointer", textAlign: "center",
    padding: "10px 18px", borderRadius: R_BOX, border: BORDER_HEAVY,
    background: bg, color: fg, fontFamily: FONT_FAMILY,
    fontSize: 16, fontWeight: 700,
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
      style={{
        position: "absolute", inset: 0, zIndex: 60,
        background: PANEL, border: BORDER_HEAVY, borderRadius: R_BOX,
        boxSizing: "border-box", padding: 16,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
        overflowY: "auto",
      }}
    >
      <h2 style={{
        margin: 0, fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 700,
        lineHeight: 1.1, color: INK, textAlign: "center",
      }}>
        {headline}
      </h2>

      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        width: "100%", maxWidth: 280,
      }}>
        {ordered.map((e) => (
          <ChipCell
            key={e.seat}
            chip={{
              kind: winners.length === 1 && e.seat === winners[0].seat ? "GREAT_MATCH" : "IDLE",
              name: e.chip.name,
              score: e.score,
              seat: e.seat,
            }}
          />
        ))}

      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {canRematch ? (
          <button type="button" onClick={onPlayAgain} style={btn(GREEN, INK)}>
            Play again
          </button>
        ) : (
          <span
            role="status"
            aria-live="polite"
            style={{ fontFamily: FONT_FAMILY, fontSize: 15, color: MUTED }}
          >
            Waiting for the host…
          </span>
        )}
        <button type="button" onClick={onLeave} style={btn(SURFACE, INK)}>
          Leave
        </button>
      </div>
    </div>
  );
};

// Top bar — 30px readout row. Settings and leave now live in the fixed
// site header, so this bar carries only the round / deck readout.
const Header: React.FC<{
  round: number;
  deckCount: number;
  onLeave: () => void;
}> = ({ round, deckCount, onLeave }) => {
  const half: React.CSSProperties = {
    flex: "1 1 0", display: "flex", alignItems: "center",
    justifyContent: "center", padding: "0 4px", minWidth: 0,
    overflow: "hidden",
  };
  const text: React.CSSProperties = {
    fontFamily: FONT_FAMILY, fontWeight: 400, fontSize: 18, lineHeight: 1,
    color: SURFACE, textAlign: "center",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  };
  return (
    <div style={{
      display: "flex", flexDirection: "row", gap: 8, height: 44, flex: "none",
    }}>
      {/* 44px bar - 2px borders = 40px content box; 8px inset top and bottom
          makes the stretched divider exactly 24px tall. */}
      <div style={{
        flex: "1 1 0", height: 44, boxSizing: "border-box",
        display: "flex", alignItems: "center",
        padding: "8px 4px", gap: 4, overflow: "hidden",
        background: INK, border: BORDER_HEAVY, borderRadius: R_BOX,
      }}>
        <div style={half}><AutoFitText minScale={0.6} style={text}>Round: {round}</AutoFitText></div>
        <div aria-hidden="true" style={{ width: 2, background: SURFACE, alignSelf: "stretch", flex: "none" }} />
        <div style={half}><AutoFitText minScale={0.6} style={text}>{deckCount} Cards Left</AutoFitText></div>
      </div>
      <button
        type="button"
        className="mp-header-btn"
        onClick={onLeave}
        aria-label="Leave game"
        style={{
          all: "unset",
          boxSizing: "border-box",
          width: 44, height: 44, flex: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: RED, border: BORDER_HEAVY, borderRadius: R_BOX,
          cursor: "pointer",
        }}
      >
        <X size={22} color={SURFACE} aria-hidden="true" />
      </button>
    </div>
  );
};


// Focus outline for keyboard users on the header buttons.
const HEADER_FOCUS_CSS = `
.mp-header-btn:focus-visible { outline: 2px solid ${ORANGE}; outline-offset: 2px; }
`;

const ModalShell: React.FC<{
  titleId: string;
  onCancel: () => void;
  children: React.ReactNode;
}> = ({ titleId, onCancel, children }) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: "absolute", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: SURFACE, border: BORDER_HEAVY, borderRadius: R_BOX,
          padding: 16, maxWidth: 340, width: "100%",
          display: "flex", flexDirection: "column", gap: 12,
          fontFamily: FONT_FAMILY, color: INK,
        }}
      >
        {children}
      </div>
    </div>
  );
};

type BannerKind = "YOUR_FLIP" | "TOO_SLOW" | "CLAIM_ERROR" | "PENALTY" | "CANCEL" | null;

const BannerStyles: Record<Exclude<BannerKind, null>, { bg: string; text: string; label: string; icon?: boolean }> = {
  YOUR_FLIP:   { bg: BLUE,    text: SURFACE, label: "YOUR FLIP!" },
  TOO_SLOW:    { bg: INK,     text: SURFACE, label: "TOO SLOW!" },
  CLAIM_ERROR: { bg: RED,     text: SURFACE, label: "CONNECTION ISSUE — TRY AGAIN" },
  PENALTY:     { bg: MUTED,   text: SURFACE, label: "PENALTY" },
  CANCEL:      { bg: SURFACE, text: RED,     label: "Cancel match", icon: true },
};

const CancelX: React.FC = () => (
  <span aria-hidden="true" style={{
    display: "inline-block", position: "relative", width: 14.55, height: 14.55,
    marginRight: 8, flex: "0 0 auto",
  }}>
    <span style={{
      position: "absolute", top: "50%", left: "50%",
      width: 18.99, height: 1.58, background: RED,
      transform: "translate(-50%, -50%) rotate(45deg)",
    }} />
    <span style={{
      position: "absolute", top: "50%", left: "50%",
      width: 18.99, height: 1.58, background: RED,
      transform: "translate(-50%, -50%) rotate(-45deg)",
    }} />
  </span>
);

const ScoreRow: React.FC<{
  score?: number; cardsLeft?: number; banner: BannerKind; onCancel?: () => void;
}> = ({ score = 0, cardsLeft = 0, banner, onCancel }) => {
  const box: React.CSSProperties = {
    flex: "1 1 0", height: 49.32, background: SURFACE,
    border: BORDER_HEAVY, borderRadius: R_STRIP, padding: 12.6609,
    boxSizing: "border-box", display: "flex", alignItems: "center",
    fontFamily: FONT_FAMILY, fontSize: 20, lineHeight: "24px",
  };
  if (banner) {
    const b = BannerStyles[banner];
    const clickable = banner === "CANCEL" && !!onCancel;
    return (
      <div style={{
        width: "100%", height: "100%", boxSizing: "border-box",
        display: "flex", alignItems: "stretch",
      }}>
        <button
          type="button"
          onClick={clickable ? onCancel : undefined}
          disabled={!clickable}
          aria-label={b.label}
          style={{
            all: "unset", cursor: clickable ? "pointer" : "default",
            width: "100%", height: "100%", background: b.bg, color: b.text,
            border: BORDER_HEAVY, borderRadius: R_STRIP, boxSizing: "border-box",
            padding: "6px 8px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONT_FAMILY, fontSize: 16, lineHeight: 1,
            pointerEvents: clickable ? "auto" : "none",
          }}
        >
          {b.icon && <CancelX />}
          <AutoFitText minScale={0.55}>{b.label}</AutoFitText>
        </button>
      </div>
    );
  }
  return (
    <div style={{
      height: 65.32, background: PANEL, border: BORDER_HEAVY,
      borderRadius: R_BOX, padding: 8, gap: 8, boxSizing: "border-box",
      display: "flex", alignItems: "center",
    }}>
      <div style={box}>
        <span style={{ color: INK }}>Your Score:&nbsp;</span>
        <span style={{ color: RED }}>{score}</span>
      </div>
      <div style={box}>
        <span style={{ color: INK }}>Cards Left: {cardsLeft}</span>
      </div>
    </div>
  );
};

type ButtonKind = "WHOOP" | "YOUR_ROLL" | "SELECT_MATCH" | "DISABLED";
const ButtonStyles: Record<ButtonKind, { bg: string; text: string; label: string }> = {
  WHOOP:        { bg: RED,    text: SURFACE, label: "WHOOP! WHOOP!" },
  YOUR_ROLL:    { bg: ORANGE, text: INK,     label: "YOUR ROLL!" },
  SELECT_MATCH: { bg: BLUE,   text: SURFACE, label: "SELECT MATCH" },
  DISABLED:     { bg: PANEL,  text: MUTED,   label: "WAIT" },
};

const DieBox: React.FC<{
  rule: string;
  heroActive: boolean;
  waiting: boolean;
  homeRef?: React.Ref<HTMLDivElement>;
}> = ({ rule, heroActive, waiting, homeRef }) => (
  <div style={{
    width: 111, flex: "none", boxSizing: "border-box", background: ORANGE,
    border: BORDER_HEAVY, borderRadius: R_BOX, padding: 8,
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center",
  }}>
    {/* The 89×89 cream box is the home cell for the roll-hero overlay. When
        the overlay is live we hide the art so the animation lands cleanly.
        While AWAITING_ROLL (and not mid-hero) the face is blank — the prior
        round's rule must not read as current. Size stays fixed so layout
        does not shift when the rule appears on settle. */}
    <div
      ref={homeRef}
      style={{
        width: 89, height: 89, background: RAW.cream, borderRadius: 8,
        transform: "rotate(-3.65deg)", filter: `drop-shadow(${CARD_SHADOW})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "8%", boxSizing: "border-box",
        opacity: heroActive ? 0 : 1, overflow: "hidden",
      }}
    >
      {waiting ? (
        <span
          aria-label="Waiting for roll"
          style={{
            fontFamily: FONT_FAMILY, fontStyle: "italic", fontWeight: 400,
            fontSize: 18, lineHeight: "18px", color: RAW.warmBlack, opacity: 0.55,
            textAlign: "center", transform: "rotate(3.65deg)",
            userSelect: "none", pointerEvents: "none",
          }}
        >
          waiting<br/>for roll…
        </span>
      ) : (
        <img
          src={MATCH_ART_SRC[rule as RollAttribute]}
          alt={`Match the ${rule}`}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }}
        />
      )}
    </div>
  </div>
);

const ActionButton: React.FC<{
  kind: ButtonKind; disabled?: boolean; onClick?: () => void; label?: string;
}> = ({ kind, disabled, onClick, label }) => {
  const s = ButtonStyles[kind];
  const isDisabled = disabled || kind === "DISABLED";
  // Shine sweep only runs while it is the human seat's turn to roll.
  const shineOn = kind === "YOUR_ROLL" && !isDisabled;
  const shineStyle: React.CSSProperties = {
    pointerEvents: "none",
    background: "#F8F2E9",
    transformOrigin: "0 0",
    animationPlayState: shineOn ? "running" : "paused",
    opacity: shineOn ? 1 : 0,
  };
  // Text starts at the ideal size and AutoFitText shrinks it to the measured
  // width — so long labels ("WHOOP! WHOOP!") never clip at any breakpoint.
  const text = label ?? s.label;
  return (
    <button
      type="button"
      className={isDisabled ? undefined : "ww-press"}
      onClick={isDisabled ? undefined : () => { hapticImpact(); onClick?.(); }}
      disabled={isDisabled}
      style={{
        all: "unset", cursor: isDisabled ? "not-allowed" : "pointer",
        flex: "1 1 0", minWidth: 0, alignSelf: "stretch", background: s.bg, color: s.text,
        border: BORDER_HEAVY, borderRadius: R_BOX, boxSizing: "border-box",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: FONT_FAMILY, fontStyle: "italic", fontWeight: 400,
        fontSize: "clamp(19px, 6.4vw, 32px)", lineHeight: 1.15, textAlign: "center",
        padding: "10px 6px",
        position: "relative", overflow: "hidden",
      }}
    >
      <AutoFitText minScale={0.55} style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        {text}
      </AutoFitText>


      <span aria-hidden="true" className="ww-shine-thin" style={shineStyle} />
      <span aria-hidden="true" className="ww-shine-wide" style={shineStyle} />
    </button>
  );
};

// -------- Diagnostic overlay (?debug=1) --------
//
// Inert unless window.location.search contains debug=1. Values are read
// live from props on every render — no snapshots. Never mutates state or
// intercepts pointer events.
const useDebugFlag = (): boolean => {
  const read = () =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";
  const [on, setOn] = React.useState<boolean>(read);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setOn(read());
    window.addEventListener("popstate", handler);
    window.addEventListener("hashchange", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      window.removeEventListener("hashchange", handler);
    };
  }, []);
  return on;
};

const PresenceDebugOverlay: React.FC<{
  mySeat: number | null;
  visitorId: string;
  seatMap: PublicState["seatMap"];
  reducerDisconnectedSeats: number[];
  presenceVisitorIds?: string[];
  heartbeatStale?: number[];
  awaySkip?: number[];
  hostDisconnectedSeats?: number[];
}> = ({
  mySeat,
  visitorId,
  seatMap,
  reducerDisconnectedSeats,
  presenceVisitorIds,
  heartbeatStale = [],
  awaySkip = [],
  hostDisconnectedSeats = [],
}) => {
  const on = useDebugFlag();
  if (!on) return null;
  const present = new Set(presenceVisitorIds ?? []);
  const total = seatMap.length;
  const presenceOnlyMissing = seatMap
    .filter((e) => !present.has(e.visitor_id))
    .map((e) => e.seat);
  const connected = total - presenceOnlyMissing.length;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 4,
        left: 4,
        zIndex: 1000,
        background: "rgba(35,31,32,0.88)",
        color: "#F8F2E9",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        lineHeight: "14px",
        padding: "6px 8px",
        borderRadius: 4,
        maxWidth: 320,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
      }}
      aria-hidden="true"
      data-testid="presence-debug-overlay"
    >
      {`mySeat: ${mySeat ?? "-"}
visitor_id: ${visitorId}
connected: ${connected}/${total}
presenceOnlyMissing: [${presenceOnlyMissing.join(",")}]
heartbeatStale: [${heartbeatStale.join(",")}]
awaySkip: [${awaySkip.join(",")}]
hostDisconnectedSeats: [${hostDisconnectedSeats.join(",")}]
reducer.disconnected: [${reducerDisconnectedSeats.join(",")}]
presenceIds: ${presenceVisitorIds ? presenceVisitorIds.length : "n/a"}`}
    </div>
  );
};

// Debug-only action buttons (?debug=1). Inert otherwise.
const DebugControls: React.FC<{
  deckCount: number;
  isHost: boolean;
  onIntent: (a: IntentAction) => void;
}> = ({ deckCount, isHost, onIntent }) => {
  const on = useDebugFlag();
  // Host/solo only: joiners have no debug authority, so don't offer the UI.
  if (!on || !isHost) return null;
  return (
    <div style={{ position: "absolute", bottom: 4, right: 4, zIndex: 1001, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <button
        type="button"
        onClick={() => onIntent({ type: "DEBUG_DRAIN_DECK" })}
        style={{
          background: "rgba(35,31,32,0.88)",
          color: "#F8F2E9",
          border: "1px solid #F8F2E9",
          borderRadius: 4,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          padding: "4px 8px",
          cursor: "pointer",
        }}
        data-testid="debug-drain-deck"
      >
        {`Drain draw pile (${deckCount})`}
      </button>
      <button
        type="button"
        onClick={() => onIntent({ type: "DEBUG_FORCE_END_GAME" })}
        style={{
          background: "rgba(35,31,32,0.88)",
          color: "#F8F2E9",
          border: "1px solid #F8F2E9",
          borderRadius: 4,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          padding: "4px 8px",
          cursor: "pointer",
        }}
        data-testid="debug-force-end-game"
      >
        Force end game
      </button>
    </div>
  );
};

// -------- Main component --------


const MultiplayerGameView: React.FC<Props> = ({
  publicState: s, mySeat, events = [], rollCommit = null, lastClaimReject = null, onIntent, onLeave, mobile = false, roomId, visitorId, isHost, presenceVisitorIds,
  heartbeatStale, awaySkip, hostDisconnectedSeats, presenceStatus, soloMode = false,
}) => {
  const [showSettings, setShowSettings] = React.useState(false);
  const [showLeave, setShowLeave] = React.useState(false);
  const modalOpen = showSettings || showLeave;

  // Fade in a radial vignette over the persistent intro-animation still once
  // gameplay mounts, softening the background pattern behind the board.
  // Fade it back out when the game ends so the background returns cleanly.
  const isGameOver = s.phase === "GAME_OVER";
  const [bgOverlayVisible, setBgOverlayVisible] = useState(false);
  useEffect(() => {
    if (isGameOver) {
      setBgOverlayVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => setBgOverlayVisible(true));
    return () => cancelAnimationFrame(id);
  }, [isGameOver]);

  // ---- roll-hero overlay wiring ----------------------------------------
  // Root of the play area — the overlay is absolutely positioned inside it.
  // Home ref points at the 80×80 cream box inside the dice tray.
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const homeRef = React.useRef<HTMLDivElement | null>(null);
  // `activeCommit` is the commit we're CURRENTLY animating. It becomes null
  // when the 1100ms window expires (or is skipped if we arrived too late).
  // Preload every card face once on mount. Uncached SVGs otherwise decode
  // after the flip starts, briefly showing an empty/backed front face.
  React.useEffect(() => {
    preloadGameArt();
  }, []);

  // Pending sound timers, cleared on unmount so no chime outlives the board.
  const soundTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  React.useEffect(() => {
    applyAnimationTimingVars();
    return () => { soundTimersRef.current.forEach(clearTimeout); soundTimersRef.current = []; };
  }, []);

  const [activeCommit, setActiveCommit] = React.useState<RollCommitPayload | null>(null);
  const [heroRects, setHeroRects] = React.useState<{
    home: DOMRect; target: DOMRect; parent: DOMRect;
  } | null>(null);
  React.useEffect(() => {
    if (!rollCommit) return;
    // Ignore repeats of the same commit (state updates after we've completed).
    if (activeCommit && activeCommit.startAt === rollCommit.startAt) return;
    const elapsed = serverNow() - rollCommit.startAt;
    if (elapsed >= ROLL_HERO_MS) return; // arrived too late — skip animation
    const home = homeRef.current?.getBoundingClientRect() ?? null;
    const target = cardAreaRef.current?.getBoundingClientRect() ?? null;
    const parent = rootRef.current?.getBoundingClientRect() ?? null;
    if (!home || !target || !parent) return;
    setHeroRects({ home, target, parent });
    setActiveCommit(rollCommit);
    playDiceRoll();
    hapticImpact();
    // cardAreaRef is declared below; the ref itself is stable so eslint's
    // dependency check is not helpful here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollCommit]);
  const heroActive = activeCommit !== null;
  const isMyTurnToRoll = mySeat !== null && s.roller === mySeat && s.phase === "AWAITING_ROLL" && !s.rolling;
  const isMyTurnToFlip = mySeat !== null && s.flipper === mySeat && s.phase === "FLIPPING" && s.peekingCard === null;
  // NOTE: the old ~500ms "flip rotation freeze" on WHOOP was removed — a
  // player may claim mid-flip, so there is no window where the button is inert.
  // Cards must LOOK inert while another seat holds an open claim — otherwise a
  // player taps, nothing happens, and the game reads as frozen.
  const otherSeatClaiming =
    mySeat !== null && s.claimBy !== null && s.claimBy !== mySeat;
  const cardsInteractive = !otherSeatClaiming;
  // RULES: a player may call out at ANY moment once the round's rule is
  // rolled — during someone else's flip, between turns, before a single card
  // has been turned. There is deliberately NO flip requirement here: the only
  // guards are the rolled-rule gate (phase), an open claim, SETTLING, game
  // over, and a seat that is out of the game.
  const seatOutOfGame =
    mySeat !== null && (s.disconnectedSeats?.includes(mySeat) ?? false);
  const canClaim =
    mySeat !== null &&
    !seatOutOfGame &&
    s.phase === "FLIPPING" &&
    s.claimBy === null;
  const inClaimMode = s.phase === "CLAIM_SELECTING" && s.claimBy === mySeat;
  const [claimBusy, setClaimBusy] = React.useState(false);
  const [tooSlowAt, setTooSlowAt] = React.useState<number | null>(null);
  const [claimErrAt, setClaimErrAt] = React.useState<number | null>(null);
  // Clear transient claim feedback when the claim window rotates.
  React.useEffect(() => { setTooSlowAt(null); setClaimErrAt(null); }, [s.claimWindow]);
  // Auto-clear TOO SLOW after a short interval so the banner doesn't stick.
  React.useEffect(() => {
    if (tooSlowAt === null) return;
    const t = setTimeout(() => setTooSlowAt(null), 1400);
    return () => clearTimeout(t);
  }, [tooSlowAt]);
  // Auto-clear claim-error banner similarly.
  React.useEffect(() => {
    if (claimErrAt === null) return;
    const t = setTimeout(() => setClaimErrAt(null), 1800);
    return () => clearTimeout(t);
  }, [claimErrAt]);

  // Host-dropped claim grant (window mismatch): if the rejected seat is
  // ours, we thought we won but the host discarded the grant. Surface the
  // CONNECTION ISSUE banner instead of a silent hang. Also clears LOCKING…
  // if we happen to still be mid-request.
  const lastRejectKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!lastClaimReject || mySeat === null) return;
    if (lastClaimReject.seat !== mySeat) return;
    const key = `${lastClaimReject.grant_claim_window}:${lastClaimReject.host_claim_window}:${lastClaimReject.reason}`;
    if (lastRejectKeyRef.current === key) return;
    lastRejectKeyRef.current = key;
    console.warn("[claim_reject:self]", lastClaimReject);
    setClaimBusy(false);
    setClaimErrAt(Date.now());
  }, [lastClaimReject, mySeat]);

  // -------- Sound effects --------
  // Each fires once per event using refs to remember previous values / seen
  // event ids. Do not derive from render — refs survive re-renders and dedupe
  // re-broadcasts of the same PublicState snapshot.
  const prevPeekForSoundRef = React.useRef<number | null>(s.peekingCard);
  React.useEffect(() => {
    const prev = prevPeekForSoundRef.current;
    prevPeekForSoundRef.current = s.peekingCard;
    if (prev === null && s.peekingCard !== null) playFlip();
  }, [s.peekingCard]);

  const prevClaimByRef = React.useRef<number | null>(s.claimBy);
  React.useEffect(() => {
    const prev = prevClaimByRef.current;
    prevClaimByRef.current = s.claimBy;
    if (prev === null && s.claimBy !== null) playWhoopCall();
  }, [s.claimBy]);

  // Remember the last pair of touched cards. The NOPE event lands on the tick
  // after the claim resolves, when selectedCards is already empty — so this
  // ref is never cleared, only overwritten by the next full pair.
  const lastPairRef = React.useRef<number[]>([]);
  React.useEffect(() => {
    if (s.selectedCards.length === 2) {
      lastPairRef.current = [...s.selectedCards];
    }
  }, [s.selectedCards]);

  // ---- great-match flying copies ---------------------------------------
  // The grid (and its ancestors) clip, so the scale+slide is performed by
  // copies rendered into a fixed-position layer that is a child of the page
  // root. We measure each matched cell at event time and pin the copy there.
  const cellRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const gridRef = React.useRef(s.grid);
  gridRef.current = s.grid;
  const [flyCards, setFlyCards] = React.useState<
    { key: string; card: Card; rect: { top: number; left: number; width: number; height: number } }[]
  >([]);
  const flyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (flyTimerRef.current) clearTimeout(flyTimerRef.current);
  }, []);

  // While SETTLING on a MATCH the real cards leave the table entirely — the
  // flying copy is the only visible card, and it stays mounted for the whole
  // settle window (SETTLE_MATCH_MS === animation delay + duration).
  const matchSettling = s.phase === "SETTLING" && s.settleKind === "MATCH";
  React.useEffect(() => {
    if (matchSettling) return;
    if (flyTimerRef.current) clearTimeout(flyTimerRef.current);
    setFlyCards((prev) => (prev.length ? [] : prev));
  }, [matchSettling]);




  const [wrongCards, setWrongCards] = React.useState<number[]>([]);
  // Transient PENALTY chip state — same NOPE event, same 900ms window as the
  // wrong-card animation. Falls back to the seat's live state after.
  const [penaltySeat, setPenaltySeat] = React.useState<number | null>(null);
  const wrongTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
  }, []);

  const seenEventIdsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    for (const e of events) {
      if (seenEventIdsRef.current.has(e.id)) continue;
      seenEventIdsRef.current.add(e.id);
      if (e.kind === "GREAT_MATCH") {
        // The ghost animation has a GREAT_MATCH_DELAY_MS animation-delay —
        // hold the sound by the same amount so it lands with the card.
        const chime = setTimeout(() => { playCorrect(); hapticSuccess(); }, GREAT_MATCH_DELAY_MS);
        soundTimersRef.current.push(chime);
        const idxs = lastPairRef.current;
        const copies = idxs.flatMap((i) => {
          const el = cellRefs.current[i];
          const card = gridRef.current[i]?.card;
          if (!el || !card) return [];
          const r = el.getBoundingClientRect();
          return [{
            key: `${e.id}-${i}`,
            card,
            rect: { top: r.top, left: r.left, width: r.width, height: r.height },
          }];
        });
        if (copies.length) {
          setFlyCards(copies);
          // Safety net only — the copy is normally unmounted when SETTLING
          // ends (see effect below), which is exactly SETTLE_MATCH_MS.
          if (flyTimerRef.current) clearTimeout(flyTimerRef.current);
          flyTimerRef.current = setTimeout(() => setFlyCards([]), 1300);
        }
      }

      else if (e.kind === "NOPE") {
        playWrong();
        hapticError();
        // Every player sees the wrong pair animate — no seat filter.
        setWrongCards(lastPairRef.current);
        setPenaltySeat(e.seat);
        if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
        wrongTimerRef.current = setTimeout(() => {
          setWrongCards([]);
          setPenaltySeat(null);
        }, 900);
      }
    }
    // Bound the dedup set so it doesn't grow forever across a long session.
    if (seenEventIdsRef.current.size > 256) {
      const arr = Array.from(seenEventIdsRef.current);
      seenEventIdsRef.current = new Set(arr.slice(-128));
    }
  }, [events]);

  // Deal-in bookkeeping. A slot that newly becomes occupied gets a fresh
  // remount key (so the deal animation replays) and a stagger index: reading
  // order on the initial deal, 0/1 on a refill regardless of grid position.
  const dealRef = React.useRef<{ occ: boolean[]; keys: number[]; idx: number[]; seq: number }>({
    occ: [], keys: [], idx: [], seq: 0,
  });
  const dealInfo = React.useMemo(() => {
    const st = dealRef.current;
    const occ = s.grid.map((sl) => sl.occupied);
    const newly: number[] = [];
    for (let i = 0; i < occ.length; i++) if (occ[i] && !st.occ[i]) newly.push(i);
    const initial = st.occ.length === 0 || st.occ.every((o) => !o) || newly.length > 2;
    newly.forEach((slot, n) => {
      st.seq += 1;
      st.keys[slot] = st.seq;
      st.idx[slot] = initial ? slot : n;
    });
    st.occ = occ;
    return { keys: [...st.keys], idx: [...st.idx] };
  }, [s.grid]);


  // Deal sound when the grid refills after a claim. Watch occupied count
  // rising — a claim removes cards then the deck deals to fill the gaps.
  const occupiedCount = s.grid.reduce((n, slot) => n + (slot.occupied ? 1 : 0), 0);
  const prevOccupiedRef = React.useRef<number>(occupiedCount);
  React.useEffect(() => {
    const prev = prevOccupiedRef.current;
    prevOccupiedRef.current = occupiedCount;
    const count = occupiedCount - prev;
    if (count <= 0) return;
    // playDeal() is now a single soft landing sound for the whole batch;
    // fire it once as the first new card lands.
    const delay = Math.max(0, Math.round(DEAL_MOVE_MS));
    const t = setTimeout(() => playDeal(count), delay);
    soundTimersRef.current.push(t);
    return () => { clearTimeout(t); };
  }, [occupiedCount]);


  // Wash elements keyed by grid index, so the resolve effect can address the
  // exact card that was selected second (DOM order != selection order).
  const washRefs = React.useRef<Record<number, HTMLDivElement | null>>({});

  // Optimistic selection: highlight the instant a card is touched, so the
  // animation runs for the whole selection hold rather than only
  // after the intent round-trips back as state.

  const [optimisticSel, setOptimisticSel] = React.useState<number[]>([]);
  React.useEffect(() => {
    if (!inClaimMode) setOptimisticSel([]);
  }, [inClaimMode]);
  React.useEffect(() => {
    if (s.selectedCards.length === 0) setOptimisticSel([]);
  }, [s.selectedCards.length]);

  // onIntent is not referentially stable (useCallback deps churn), so hold it
  // in a ref: the resolve effect must not tear down and restart on identity
  // changes, which would reset the fallback timer and re-bind the listener to
  // an animation that already finished.
  const onIntentRef = React.useRef(onIntent);
  onIntentRef.current = onIntent;

  // Auto-resolve match once two cards are selected during a claim.
  //
  // The wash starts animating at click time via optimisticSel, so the effect
  // keys off the *local* pair rather than waiting for the reducer round-trip.
  // Dispatch requires BOTH the animation having ended AND the authoritative
  // state carrying two selections — the reducer drops PLAYER_RESOLVE_MATCH
  // when selectedCards.length !== 2, which with a single-dispatch guard would
  // hang the claim forever.
  const localPair = optimisticSel.length === 2 ? optimisticSel : s.selectedCards;
  const localPairKey = localPair.length === 2 ? localPair.join(",") : "";
  const serverPairReady = s.selectedCards.length === 2;
  const serverReadyRef = React.useRef(serverPairReady);
  serverReadyRef.current = serverPairReady;
  // Set by the resolve effect; called again when the server catches up.
  const maybeResolveRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (!inClaimMode || !localPairKey || mySeat === null) {
      maybeResolveRef.current = null;
      return;
    }

    const secondIdx = Number(localPairKey.split(",")[1]);
    let done = false;
    let animEnded = false;
    let via: "animationend" | "timer" = "animationend";
    let target: HTMLDivElement | null = null;
    let raf = 0;

    const tryFire = () => {
      if (done || !animEnded || !serverReadyRef.current) return;
      done = true;
      maybeResolveRef.current = null;
      if (import.meta.env.DEV) {
        console.log(`[resolve] PLAYER_RESOLVE_MATCH via ${via} (card ${secondIdx})`);
      }
      onIntentRef.current({ type: "PLAYER_RESOLVE_MATCH", by: mySeat });
    };
    maybeResolveRef.current = tryFire;

    const onEnd = () => {
      animEnded = true;
      tryFire();
    };

    // Fallback: started once per pair, never reset by re-renders (deps are
    // stable for the life of the pair). If the server never registered both
    // selections there is nothing to resolve, so cancel the claim instead of
    // dispatching into a no-op.
    const t = setTimeout(() => {
      if (done) return;
      if (!serverReadyRef.current) {
        done = true;
        maybeResolveRef.current = null;
        if (import.meta.env.DEV) {
          console.log("[resolve] CANCEL_CLAIM — server never reached 2 selections");
        }
        onIntentRef.current({ type: "CANCEL_CLAIM", by: mySeat });
        return;
      }
      animEnded = true;
      via = "timer";
      tryFire();
    }, 700);

    // The wash for the second card may not be mounted on this render pass;
    // poll on animation frames until it appears (the timer is the backstop).
    const attach = () => {
      if (done) return;
      const el = washRefs.current[secondIdx];
      if (el) {
        target = el;
        el.addEventListener("animationend", onEnd);
        return;
      }
      raf = requestAnimationFrame(attach);
    };
    attach();

    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      target?.removeEventListener("animationend", onEnd);
      maybeResolveRef.current = null;
    };
  }, [inClaimMode, localPairKey, mySeat]);

  // Server caught up after the animation already ended.
  React.useEffect(() => {
    if (serverPairReady) maybeResolveRef.current?.();
  }, [serverPairReady]);


  const handleCardClick = (i: number) => {
    if (mySeat === null) return;
    if (modalOpen) return;
    if (inClaimMode) {
      hapticTap();
      setOptimisticSel((prev) =>
        prev.includes(i) ? prev.filter((x) => x !== i) : prev.length >= 2 ? prev : [...prev, i]
      );
      onIntent({ type: "PLAYER_SELECT_CARD", by: mySeat, idx: i });
      return;
    }

    if (isMyTurnToFlip) {
      const slot = s.grid[i];
      if (!slot.occupied) return;
      hapticTap();
      onIntent({ type: "FLIP_START", by: mySeat, idx: i, token: Date.now() });
    }
  };

  // -------- Compose self surfaces --------

  // Score row banner selection. Precedence: cancel-during-claim > penalty >
  // too-slow > your-flip > none.
  let banner: BannerKind = null;
  const canCancelClaim = inClaimMode && s.selectedCards.length < 2;
  if (canCancelClaim) banner = "CANCEL";
  else if (claimErrAt !== null) banner = "CLAIM_ERROR";
  else if (tooSlowAt !== null) banner = "TOO_SLOW";
  else if (isMyTurnToFlip) banner = "YOUR_FLIP";

  // Animate banner enter/exit. Keep the last banner mounted briefly after it
  // disappears so the exit transition can play.
  const [exitingBanner, setExitingBanner] = React.useState<BannerKind>(null);
  React.useEffect(() => {
    if (banner) {
      setExitingBanner(null);
      return;
    }
    if (!exitingBanner) return;
    const t = setTimeout(() => setExitingBanner(null), 200);
    return () => clearTimeout(t);
  }, [banner, exitingBanner]);
  const activeBanner = banner || exitingBanner;
  const bannerExiting = banner === null && exitingBanner !== null;

  // Button state.
  let buttonKind: ButtonKind = "DISABLED";
  let buttonOnClick: (() => void) | undefined;
  let buttonLabel: string | undefined;
  if (inClaimMode) {
    // Whether the second touch has locked in (button becomes a passive label).
    buttonKind = "SELECT_MATCH";
    if (s.selectedCards.length >= 2) {
      buttonOnClick = undefined;
    }
  } else if (isMyTurnToRoll) {
    buttonKind = "YOUR_ROLL";
    buttonOnClick = () => onIntent({ type: "REQUEST_ROLL" });
    buttonLabel = s.roundNum === 1 ? "PLAY!" : "YOUR ROLL!";
  } else if (canClaim && s.phase !== "GAME_OVER") {
    buttonKind = "WHOOP";
    buttonOnClick = async () => {
      if (mySeat === null || claimBusy || modalOpen) return;
      unlockAudio();
      if (soloMode) {
        // No arbiter in solo — enter claim mode directly.
        onIntent({ type: "PLAYER_ENTER_CLAIM", by: mySeat });
        return;
      }
      setClaimBusy(true);
      const result = await callClaimLock({
        room_id: roomId,
        game_id: s.gameId,
        claim_window: s.claimWindow,
        player_seat: mySeat,
        visitor_id: visitorId,
      });
      setClaimBusy(false);
      // Tri-state: real lost race → TOO SLOW; transport/server error →
      // distinct banner so players can tell "beaten to it" from "broken".
      // Both fail closed — we never enter claim mode without a server win.
      if (result.outcome === "won") {
        // handled server-side via claim_grant broadcast
      } else if (result.outcome === "error") {
        console.error("[whoop] claim errored — see claim-lock log above", result.error);
        setClaimErrAt(Date.now());
      } else {
        setTooSlowAt(Date.now());
      }
    };
    if (claimBusy) { buttonKind = "DISABLED"; buttonOnClick = undefined; }
  }

  // Derive a descriptive label for the muted disabled state so players can
  // tell waiting, rolling, and another player's claim apart from a broken UI.
  if (buttonKind === "DISABLED") {
    if (claimBusy) {
      buttonLabel = "LOCKING…";
    } else if (mySeat !== null && s.claimBy !== null && s.claimBy !== mySeat) {
      buttonLabel = "CLAIMING…";
    } else if (s.rolling) {
      buttonLabel = "ROLLING…";
    } else {
      buttonLabel = "WAIT";
    }
  }

  // AWAITING_ROLL / ROLLING presentation gate — the WHOOP button is dimmed
  // and taps are physically blocked from the moment the round enters
  // AWAITING_ROLL through the end of ROLLING, so a player mashing during a
  // roll can never fire a claim or earn a wrong-claim penalty. The roller's
  // YOUR_ROLL button is preserved (they need to tap to roll).
  const isRolling = s.rolling;
  const dimForRoll = (s.phase === "AWAITING_ROLL" || isRolling) && !isMyTurnToRoll;
  if (dimForRoll) {
    buttonKind = "WHOOP";
    buttonOnClick = undefined;
    buttonLabel = undefined;
  }


  const chips = deriveChips(s, mySeat, events, penaltySeat);

  const myScore = mySeat !== null ? (s.scores[mySeat] ?? 0) : 0;
  const rule = s.rule[0] ?? "SHAPE";




  const header = (
    <Header
      round={s.roundNum}
      deckCount={s.deckCount}
      onLeave={() => setShowLeave(true)}
    />
  );
  const opponentRow = <OpponentRow chips={chips} />;
  const bottomRow = (
    <div style={{ display: "flex", flexDirection: "row", gap: 8, height: 110.94, flex: "none" }}>
      <DieBox rule={rule} heroActive={heroActive} waiting={s.phase === "AWAITING_ROLL" && !heroActive && !s.rolling} homeRef={homeRef} />
      {/* Wrap the WHOOP button so AWAITING_ROLL/ROLLING dims it to 40% and
          physically blocks taps. pointerEvents:none guarantees no tap ever
          reaches the onClick — belt-and-braces on top of the cleared
          handler above. */}
      <div style={{
        flex: "1 1 0", display: "flex", minWidth: 0, alignSelf: "stretch",
        opacity: dimForRoll ? 0.4 : 1,
        pointerEvents: dimForRoll ? "none" : "auto",
        transition: "opacity 250ms ease",
      }}>
        <ActionButton
          kind={buttonKind}
          disabled={dimForRoll || buttonKind === "DISABLED" || (!buttonOnClick && buttonKind !== "SELECT_MATCH")}
          onClick={dimForRoll ? undefined : buttonOnClick}
          label={buttonLabel}
        />
      </div>
    </div>
  );

  // Measured card sizing: compute per-card dimensions from the card area's
  // content box so 9 cards always fit both axes with padding + gaps.
  const cardAreaRef = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<{ w: number; h: number }>({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = cardAreaRef.current;
    if (!el) return;
    const applyBox = (w: number, h: number) => {
      setBox((prev) => {
        if (Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5) return prev;
        return { w, h };
      });
    };
    // Initial measure: read layout once for first paint.
    const cs = getComputedStyle(el);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const rect = el.getBoundingClientRect();
    applyBox(rect.width - pl - pr, rect.height - pt - pb);
    // Subsequent updates come from contentRect (already excludes padding).
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        applyBox(cr.width, cr.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure the player panel and the root so the card area can size cards
  // against the column's genuinely free vertical space.
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = React.useState(0);
  // Available vertical space comes from the viewport, not from the root
  // element: the root now hugs its content, so measuring it would feed its
  // own height back into the card size (a loop that collapses to MIN_CARD_W).
  // The wrapper's 900px ceiling is applied here instead.
  // The fixed site header eats the top of the viewport (bar height + notch
  // inset). Measure the real element so the safe-area inset is included.
  const readHeaderH = () => {
    if (typeof document === "undefined") return SITE_HEADER_H;
    const el = document.getElementById("site-header");
    return el ? el.getBoundingClientRect().height : SITE_HEADER_H;
  };
  const readViewportH = () =>
    Math.min(900, typeof window === "undefined" ? 0 : Math.max(0, window.innerHeight - readHeaderH()));
  const [rootH, setRootH] = React.useState(readViewportH);
  React.useEffect(() => {
    const pe = panelRef.current;
    const ro = new ResizeObserver(() => {
      if (pe) setPanelH((prev) => {
        const h = pe.getBoundingClientRect().height;
        return Math.abs(prev - h) < 0.5 ? prev : h;
      });
    });
    if (pe) ro.observe(pe);
    if (pe) setPanelH(pe.getBoundingClientRect().height);
    const onResize = () => setRootH((prev) => {
      const h = readViewportH();
      return Math.abs(prev - h) < 0.5 ? prev : h;
    });
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);


  // Card sizing from the measured content box. 3 columns always; rows follow
  // the host's chosen grid size (6 → 2 rows, 9 → 3 rows).
  const GAP = 8;
  const RATIO = 1.4; // design card ratio 146.07 / 104.33
  const MIN_CARD_W = 64;
  
  const COLS = 3;
  const ROWS = Math.max(1, Math.ceil(s.grid.length / COLS));
  const availW = Math.max(0, box.w);
  // Free vertical space for the card area: viewport height (already minus the
  // fixed header and its safe-area inset via rootH) minus the page wrapper's
  // top padding, the root's top padding, the inner column's top padding, the
  // 44px top bar, the player panel, the bottom bar, the three 8px column gaps,
  // and the card area's own 32px of vertical padding.
  // The banner is an overlay on the player panel, so it needs no reserved height.
  const topReserve = mobile ? MOBILE_SHELL_PAD : 8 + 8 + 8; // mobile root top; desktop wrapper top + root top + inner top
  const bottomReserve = mobile ? MOBILE_SHELL_PAD : 8 + 8;   // mobile root bottom matches side/top; desktop wrapper + root bottom

  const availH = Math.max(
    0,
    rootH - topReserve - bottomReserve - 44 - panelH - 110.94 - 24 - 32,
  );
  const byWidth = (availW - (COLS - 1) * GAP) / COLS;
  const byHeight = ((availH - (ROWS - 1) * GAP) / ROWS) / RATIO;
  const rawCardW = Math.min(byWidth, byHeight);
  const cardW = Math.floor(Math.max(MIN_CARD_W, isFinite(rawCardW) && rawCardW > 0 ? rawCardW : MIN_CARD_W));

  const cardH = Math.round(cardW * RATIO);
  const gridHeightNeeded = cardH * ROWS + GAP * (ROWS - 1);
  const needsScroll = gridHeightNeeded > availH + 0.5;

  return (
    <div ref={rootRef} style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: mobile
        ? `${MOBILE_SHELL_PAD}px ${MOBILE_SHELL_PAD}px calc(${MOBILE_SHELL_PAD}px + env(safe-area-inset-bottom)) ${MOBILE_SHELL_PAD}px`
        : 8,
      marginTop: SITE_HEADER_H,

      height: "100%",
      minHeight: mobile ? `calc(var(--ww-vh) - ${SITE_HEADER_H}px)` : undefined,
      maxHeight: mobile ? undefined : "100%",
      width: "100%",
      boxSizing: "border-box",
      background: SURFACE, overflow: "hidden", position: "relative",
    }}>
      {/* Radial vignette over the persistent intro still. z-index:-1 keeps it
          above the frozen Lottie background and below the game column. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at center, rgba(35,31,32,1) 0%, rgba(35,31,32,1) 55%, rgba(35,31,32,0) 100%)",
          opacity: bgOverlayVisible ? 1 : 0,
          transition: prefersReducedMotion() ? "none" : "opacity 1200ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        }}
      />
      <style>{HEADER_FOCUS_CSS}</style>
      <SiteHeader
        onSettings={() => setShowSettings(true)}
      />

      {activeCommit && heroRects && (
        <RollHeroOverlay
          commit={activeCommit}
          homeRect={heroRects.home}
          targetRect={heroRects.target}
          parentRect={heroRects.parent}
          onComplete={() => { setActiveCommit(null); setHeroRects(null); }}
        />
      )}
      {presenceStatus !== undefined && presenceStatus !== "connected" && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute", inset: 0, zIndex: 900,
            background: "rgba(35,31,32,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, pointerEvents: "auto",
          }}
        >
          <div style={{
            background: INK, color: SURFACE, border: `2px solid ${SURFACE}`,
            borderRadius: R_BOX, padding: "14px 22px",
            fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700,
            letterSpacing: 0.5, textAlign: "center",
          }}>
            Reconnecting…
          </div>
        </div>
      )}
      {/* ROLLING scrim — beneath the die overlay (z=30), above the play
          content. Pointer-events none so header controls stay reachable;
          the card grid and WHOOP button are blocked independently. */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          background: "rgba(35,31,32,0.6)",
          opacity: isRolling ? 1 : 0,
          pointerEvents: "none",
          transition: "opacity 250ms ease",
          zIndex: 20,
        }}
      />
      <div style={{
        display: "flex", flexDirection: "column", gap: 8,
        width: "100%", height: "auto", maxHeight: "100%",
        paddingTop: mobile ? 0 : 8, boxSizing: "border-box",
      }}>
      {header}
      <div ref={panelRef} style={{ position: "relative", flex: "none" }}>
        {opponentRow}
        {activeBanner && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            pointerEvents: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: bannerExiting ? 0 : 1,
            transform: bannerExiting ? "translateY(-6px)" : "translateY(0)",
            transition: "opacity 200ms ease, transform 200ms ease",
          }}>
            <ScoreRow
              banner={activeBanner}
              onCancel={
                canCancelClaim && mySeat !== null
                  ? () => onIntent({ type: "CANCEL_CLAIM", by: mySeat })
                  : undefined
              }
            />
          </div>
        )}
      </div>

      {/* Card area — the only flexing child. Measured card sizing. */}
      <div
        ref={cardAreaRef}
        style={{
          position: "relative", background: PANEL, border: BORDER_HEAVY,
          borderRadius: R_BOX,
          padding: 16,
          boxSizing: "border-box", flex: "0 0 auto",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "flex-start", gap: 8,
        overflowY: needsScroll ? "auto" : "hidden",
        overflowX: "hidden",
        opacity: 1,
        pointerEvents: isRolling ? "none" : "auto",
        transition: "opacity 250ms ease",
      }}
    >
      <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, ${cardW}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${cardH}px)`,
          gap: GAP,
          margin: "auto",
          position: "relative",
        }}>
          {s.grid.map((slot, i) => {
            // During a MATCH settle the matched pair has left the table: no
            // card, no green treatment — the panel shows through and the
            // flying copy carries the whole animation.
            const leaving = matchSettling && s.matchedCards.includes(i);
            if (!slot.occupied || leaving) {
              return (
                <div key={`empty-${i}`}
                  ref={(el) => { cellRefs.current[i] = el; }}
                  style={{
                    width: cardW, height: cardH,
                    border: leaving ? "none" : `2px dashed rgba(35,31,32,0.13)`,
                    borderRadius: R_CARD, boxSizing: "border-box",
                  }} />
              );
            }
            const faceUp = slot.card !== null;
            const cardForRender: Card =
              slot.card ??
              ({ id: `hidden-${i}`, shape: "circle", number: 1, color: "red", svgPath: "" } as Card);
            const selected =
              s.selectedCards.includes(i) || optimisticSel.includes(i);
            return (
              <div key={i}
                ref={(el) => { cellRefs.current[i] = el; }}
                style={{
                  width: cardW, height: cardH,
                  borderRadius: R_CARD, filter: `drop-shadow(${CARD_SHADOW})`,
                }}>

                <GameCard
                  card={cardForRender}
                  faceUp={faceUp}
                  interactive={cardsInteractive}
                  onClick={cardsInteractive ? () => handleCardClick(i) : undefined}
                  highlighted={selected}
                  wrong={wrongCards.includes(i)}
                  shaking={false}
                  fill
                  dealKey={dealInfo.keys[i]}
                  dealIndex={dealInfo.idx[i]}
                  washRef={(el) => { washRefs.current[i] = el; }}

                />
              </div>
            );
          })}
        </div>


        {s.phase === "GAME_OVER" && (
          <EndScreen
            chips={chips}
            scores={s.scores}
            names={chips.map((c) => c.name)}
            canRematch={soloMode === true || isHost}
            onPlayAgain={() => onIntent({ type: "NEW_GAME" })}
            onLeave={onLeave}
          />
        )}

        {import.meta.env.DEV && (
          <div
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              zIndex: 1000,
              background: "rgba(35,31,32,0.88)",
              color: "#F8F2E9",
              fontFamily: FONT_FAMILY,
              fontSize: 11,
              lineHeight: "14px",
              padding: "6px 8px",
              borderRadius: 4,
              maxWidth: 280,
              pointerEvents: "none",
              whiteSpace: "pre-wrap",
            }}
            aria-hidden="true"
          >
            {`contentRect: ${Math.round(box.w)}×${Math.round(box.h)}\ncard: ${cardW}×${cardH.toFixed(1)}\nbyWidth: ${byWidth.toFixed(1)}\nbyHeight: ${byHeight.toFixed(1)}\nminW: ${MIN_CARD_W} | scroll: ${needsScroll}\nseatCount: ${s.seatCount} | connected: ${s.seatMap.length - s.disconnectedSeats.length}/${s.seatMap.length}\nflipper: ${s.flipper ?? "-"} | roller: ${s.roller ?? "-"}\nlens scores:${s.scores.length} wrongBy:${s.wrongBy.length} disc:${s.disconnectedSeats.length}\nscores:[${s.scores.join(",")}]`}
          </div>
        )}

        <DebugControls deckCount={s.deckCount} isHost={isHost} onIntent={onIntent} />

        <PresenceDebugOverlay
          mySeat={mySeat}
          visitorId={visitorId}
          seatMap={s.seatMap}
          reducerDisconnectedSeats={s.disconnectedSeats}
          presenceVisitorIds={presenceVisitorIds}
          heartbeatStale={heartbeatStale}
          awaySkip={awaySkip}
          hostDisconnectedSeats={hostDisconnectedSeats}
        />
      </div>
      {bottomRow}
      </div>

      {/* Great-match flying copies. Fixed layer, direct child of the play
          root, above the grid but below modals (z=50). Nothing renders when
          there is no active great match. */}
      {flyCards.length > 0 && (
        <div
          aria-hidden
          style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40 }}
        >
          {flyCards.map((f) => (
            <div
              key={f.key}
              className="ww-great"
              style={{
                position: "absolute",
                top: f.rect.top, left: f.rect.left,
                width: f.rect.width, height: f.rect.height,
                borderRadius: R_CARD,
                overflow: "hidden",
                pointerEvents: "none",
                ["--ww-k" as string]: String(f.rect.width / 104.333),
              }}
            >
              <img
                src={f.card.svgPath}
                alt=""
                draggable={false}
                style={{ width: "100%", height: "100%", display: "block", borderRadius: R_CARD }}
              />
              {/* The copy carries the entire great-match treatment: wash,
                  shine, then ring on top. */}
              <div
                className="ww-great-wash"
                style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}
              />
              <div className="ww-great-shine" style={{ pointerEvents: "none", zIndex: 2 }} />
              <div
                className="ww-great-ring"
                style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3 }}
              />
            </div>
          ))}
        </div>
      )}


      {showSettings && (
        <SettingsSheet onClose={() => setShowSettings(false)} />
      )}
      {showLeave && (
        <ModalShell titleId="mp-leave-title" onCancel={() => setShowLeave(false)}>
          <h2 id="mp-leave-title" style={{ margin: 0, fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 700, color: INK }}>
            {isHost ? "End the game?" : "Leave the table?"}
          </h2>
          <p style={{ margin: 0, fontFamily: FONT_FAMILY, fontSize: 15, lineHeight: 1.4, color: INK }}>
            {isHost
              ? "Leaving now ends the game for everyone. All players will be returned to the lobby and the game cannot be resumed."
              : "Your seat and score stay visible to the table with your turns auto-skipped — you won't be removed."}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setShowLeave(false)}
              style={{
                all: "unset", cursor: "pointer",
                padding: "8px 16px", background: SURFACE, color: INK,
                border: BORDER_HEAVY, borderRadius: R_BOX,
                fontFamily: FONT_FAMILY, fontSize: 16,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { setShowLeave(false); onLeave(); }}
              style={{
                all: "unset", cursor: "pointer",
                padding: "8px 16px", background: RED, color: SURFACE,
                border: BORDER_HEAVY, borderRadius: R_BOX,
                fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700,
              }}
            >
              {isHost ? "End game" : "Leave"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
};


export default MultiplayerGameView;
