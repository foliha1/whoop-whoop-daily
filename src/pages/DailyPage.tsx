import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { HelpCircle, Settings } from "lucide-react";

import GameCard from "@/components/GameCard";
import DailyFrame, { DAILY_CONTENT_MAX_W } from "@/components/DailyFrame";
import DailyHowToSteps, { hasSeenHowTo } from "@/components/DailyHowToSteps";
import DailyRoundIntro, { DAILY_FADE_IN_MS } from "@/components/DailyRoundIntro";
import DailyMatchGhost, { type GhostCard } from "@/components/DailyMatchGhost";
import DailyScreenFade from "@/components/DailyScreenFade";

import DailyLogoLockup from "@/components/DailyLogoLockup";
import SettingsSheet from "@/components/SettingsSheet";
import DailyLegalFooter from "@/components/DailyLegalFooter";
import DailyEmailCapture from "@/components/DailyEmailCapture";
import DailyRecognition from "@/components/DailyRecognition";
import DailyPreLaunchSignup from "@/components/DailyPreLaunchSignup";
import { useSubscriberStatus } from "@/hooks/useSubscriberStatus";

import { useDailyGame } from "@/hooks/useDailyGame";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useViewportHeight,
  compressionFactor,
  lerpCompress,
} from "@/hooks/useViewportHeight";

import {
  DAILY_ROUNDS,
  MISSES_PER_ROUND,
  remainingCount,
  type DailyMark,
} from "@/lib/dailyEngine";
import {
  DAILY_LAUNCH_LABEL,
  formatDailyShare,
  formatDailyShareCaption,
  type DailyResult,
} from "@/lib/daily";
import { renderDailyShareImage } from "@/lib/dailyShareImage";
import { useDailyShareImage, type DailyShareImage } from "@/hooks/useDailyShareImage";
import DailySharePreview from "@/components/DailySharePreview";
import { preloadGameArt } from "@/lib/preloadArt";
import { getInviteCode } from "@/lib/inviteCode";
import { toast } from "@/hooks/use-toast";
import {
  flushDailyEvents,
  noteInviteLanding,
  setDailyTrackingEnabled,
  trackDaily,
} from "@/lib/dailyEvents";


import {
  formatStreakLine,
} from "@/lib/dailyResults";
import { useDailyStreakState } from "@/hooks/useDailyStreak";
import { useDailyProfile } from "@/hooks/useDailyProfile";
import { useWhoopPointsState } from "@/hooks/useWhoopPoints";
import WhoopPointsChange from "@/components/WhoopPointsChange";
import { badgeArt, formatPointsChange } from "@/lib/whoopTiers";
import type { WhoopPoints } from "@/lib/whoopPoints";

import { runDailyEndSequence } from "@/lib/dailyEndSequence";
import {
  DAILY_MATCH_HOLD_MS,
  DAILY_MATCH_REVEAL_MS,
  GREAT_MATCH_DELAY_MS,
  DEAL_MOVE_MS,
  UI_ENTER_MS,
  UI_REVISIT_MS,
  UI_SECTION_STAGGER_MS,
  UI_SMALL_ENTER_MS,
} from "@/lib/animationTiming";

import { hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";

import {
  playCorrect,
  playDeal,
  playDeselect,
  playDiceRoll,
  playFlip,
  playPeek,
  playReveal,
  playRoundAdvance,
  playSelect,
  playStart,
  playTick,
  playWhoopCall,
  playWrong,
  startTheme,
  stopTheme,
  prewarmTheme,
  unlockAudio,
} from "@/lib/sounds";

import {
  BORDER,
  COLORS,
  RAW,

  RADIUS,
  SPACE,
  buttonStyle,
  textStyle,
  FONT_WEIGHT_UI,


} from "@/lib/tokens";
import { useThemeMode } from "@/lib/nightMode";
import DailyMilestoneConfetti, { BURST_LIFETIME_MS } from "@/components/DailyMilestoneConfetti";
import WhoopScoreAnnouncement, { isReturningScorePlayer, hasEarlierDailyResult, hasSeenScoreAnnouncement, SCORE_ANNOUNCEMENT } from "@/components/WhoopScoreAnnouncement";
import { fetchDailyResults } from "@/lib/dailyResults";
import { getSubscribedEmail } from "@/lib/dailySubscribe";
import {
  hasCelebrated,
  isMilestonePreview,
  isMilestoneStreak,
  markCelebrated,
  PREVIEW_STREAK,
} from "@/lib/dailyMilestone";


const ATTR_LABEL: Record<string, string> = {
  SHAPE: "Match the shape",
  NUMBER: "Match the number",
  COLOR: "Match the color",
};

// Results-screen entrance motion: block stagger and the per-mark sequence.
const BLOCK_STAGGER_MS = UI_SECTION_STAGGER_MS;
const BLOCK_IN_MS = UI_ENTER_MS;
const MARK_STAGGER_MS = 70;
const MARK_IN_MS = UI_SMALL_ENTER_MS;
/** Delay index of each block, in the order they arrive. */
const RESULT_BLOCK = {
  heading: 0,
  message: 1,
  stats: 2,
  rounds: 3,
  /** The Whoop Score panel, directly after today's result. */
  score: 4,
  share: 5,
  done: 6,
  email: 7,
} as const;
const blockIn = (block: keyof typeof RESULT_BLOCK): React.CSSProperties =>
  ({ "--ww-res-delay": `${RESULT_BLOCK[block] * BLOCK_STAGGER_MS}ms` } as React.CSSProperties);
/** Marks start once their block has landed. */
const MARKS_BASE_DELAY_MS = RESULT_BLOCK.rounds * BLOCK_STAGGER_MS + BLOCK_IN_MS;

/** Two markers for the current round, filled as its misses are spent. */
const MissTracker: React.FC<{ used: number }> = ({ used }) => (
  <div
    role="img"
    aria-label={`${used} of ${MISSES_PER_ROUND} misses used this round`}
    style={{ display: "flex", gap: SPACE[2], alignItems: "center" }}
  >
    {Array.from({ length: MISSES_PER_ROUND }, (_, i) => (
      <span
        key={i}
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          border: BORDER.heavy,
          background: i < used ? COLORS.red : "transparent",
          transition: "background 200ms ease",
        }}
      />
    ))}
  </div>
);

/** One marker per resolved call in a round, in the order they happened. */
const RoundMarks: React.FC<{
  events: DailyMark[];
  /** When set, each mark animates in with this running index as its offset. */
  animateFrom?: number;
  /** Delay of the first mark in the whole sequence. */
  baseDelayMs?: number;
}> = ({ events, animateFrom, baseDelayMs = 0 }) => {
  const anim = (i: number): React.CSSProperties =>
    animateFrom === undefined
      ? {}
      : ({
          "--ww-mark-delay": `${baseDelayMs + (animateFrom + i) * MARK_STAGGER_MS}ms`,
        } as React.CSSProperties);
  const cls = animateFrom === undefined ? undefined : "ww-mark-in";
  return (
    <div style={{ display: "flex", gap: SPACE[2], alignItems: "center" }}>
      {events.length === 0 ? (
        <span className={cls} style={{ display: "inline-flex", ...anim(0) }}>
          <span
            style={{
              width: SPACE[6],
              height: SPACE[6],
              opacity: 0.3,
              border: BORDER.heavy,
              borderRadius: 999,
            }}
          />
        </span>
      ) : (
        events.map((m, i) => (
          <span
            key={i}
            className={cls}
            title={m === "SOLVE" ? "Solved" : "Miss"}
            style={{
              width: SPACE[6],
              height: SPACE[6],
              borderRadius: 999,
              background: m === "SOLVE" ? COLORS.blue : COLORS.red,
              ...anim(i),
            }}
          />
        ))
      )}
    </div>
  );
};

/**
 * Share block — SHARE opens the preview modal (see it before you post it), and
 * the modal's Send runs the OS share sheet with the already-rendered PNG
 * attached. Every failure path degrades to text, silently, and a render that
 * failed outright skips the modal entirely.
 */
const ShareBlock: React.FC<{
  text: string;
  result: DailyResult;
  streak: number | null;
  mobile: boolean;
  /** When set, the multiplayer shine sweep runs once after this delay. */
  sweepDelayMs?: number;
  /** Already-rendered share image, reused instead of rendering a second time. */
  image?: DailyShareImage;
}> = ({ text, result, streak, mobile, sweepDelayMs, image }) => {
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);
  /** The preview modal, opened by SHARE and dismissed by Escape/CLOSE. */
  const [previewOpen, setPreviewOpen] = useState(false);
  const shareBtnRef = React.useRef<HTMLButtonElement | null>(null);
  /** Set when the clipboard write was refused: we show the text to copy by hand. */
  const [manual, setManual] = useState(false);
  const manualRef = React.useRef<HTMLTextAreaElement | null>(null);
  /** Guards the invite path against a double tap or an in-flight share sheet. */
  const inviteBusyRef = React.useRef(false);


  const flashCopied = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Clipboard write, started while the user's tap is still an active gesture.
   * Firefox (and Safari) revoke gesture status across an await, so this must be
   * kicked off before the share image renders — never after.
   */
  const beginClipboardWrite = (): Promise<boolean> => {
    try {
      const write = navigator?.clipboard?.writeText?.(text);
      if (!write) return Promise.resolve(false);
      return write.then(
        () => true,
        () => false
      );
    } catch {
      return Promise.resolve(false);
    }
  };

  /** Honest ending for the clipboard path: only claim "COPIED" if it copied. */
  const settleClipboard = async (copyPromise: Promise<boolean>) => {
    const ok = await copyPromise;
    if (ok) {
      setManual(false);
      trackDaily("share_clicked", {
        puzzleNumber: result.puzzleNumber,
        props: { method: "clipboard" },
      });
      flashCopied();
    } else {
      setManual(true);
      window.setTimeout(() => {
        manualRef.current?.focus();
        manualRef.current?.select();
      }, 0);
    }
  };

  const shareTextOnly = async (copyPromise: Promise<boolean>) => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text });
        trackDaily("share_clicked", {
          puzzleNumber: result.puzzleNumber,
          props: { method: "text" },
        });
        return;
      }
    } catch {
      /* dismissed or unsupported — fall through to clipboard */
    }
    await settleClipboard(copyPromise);
  };

  const share = async () => {
    hapticTap();
    // Started first, inside the live gesture. If a native share succeeds we
    // simply never surface the result.
    const copyPromise = beginClipboardWrite();
    setManual(false);
    setWorking(true);
    // The modal preview already rendered this exact artifact — reuse it and
    // only render on demand when it never arrived.
    let blob: Blob | null = image?.blob ?? null;
    if (!blob) {
      try {
        blob = await renderDailyShareImage(result, streak, image?.theme ?? "light");
      } catch {
        blob = null;
      }
    }
    setWorking(false);

    if (blob) {
      try {
        // The File constructor is unavailable/throwing on some older Safari
        // builds — constructing it here means that failure falls through to
        // the text share instead of aborting the whole thing.
        const file = new File([blob], `whoop-whoop-${result.puzzleNumber}.png`, {
          type: "image/png",
        });
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          navigator.canShare?.({ files: [file] })
        ) {
          await navigator.share({
            files: [file],
            // The image carries the score, so the caption is a short
            // invitation. Text-only paths keep the scoreboard string.
            text: formatDailyShareCaption(result.puzzleNumber),
          });
          trackDaily("share_clicked", {
            puzzleNumber: result.puzzleNumber,
            props: { method: "image" },
          });
          return;
        }
      } catch {
        /* no File support, dismissed, or file share refused — fall back below */
      }
    }

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await shareTextOnly(copyPromise);
      return;
    }

    // No web share at all — download the image and copy the text.
    if (blob) {
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `whoop-whoop-${result.puzzleNumber}.png`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        trackDaily("share_clicked", {
          puzzleNumber: result.puzzleNumber,
          props: { method: "download" },
        });
      } catch {
        /* download blocked — the text copy below is still useful */
      }
    }

    await settleClipboard(copyPromise);
  };

  /**
   * INVITE — a separate, link-only path. It shares nothing but today's URL:
   * no score, no rounds, no misses, no streak, no peek, no cards, no rule.
   * It never runs while the image share is in flight.
   */
  const invite = async (source: "results" | "modal") => {
    if (working || inviteBusyRef.current) return;
    inviteBusyRef.current = true;
    hapticTap();
    const code = getInviteCode();
    const url = `https://whoop-whoop.com/?i=${code}`;
    const text = "Play today's Whoop! Whoop! Daily.";

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text, url });
        // Fired only once the sheet has resolved — the page is awake again, so
        // the normal debounce and the pagehide listener carry the write.
        trackDaily("invite_sent", {
          puzzleNumber: result.puzzleNumber,
          props: { code, source, method: "share" },
        });
        return;
      }
      throw new Error("no-web-share");
    } catch (err) {
      // A dismissed sheet is silent, and is not a sent invite.
      if (err instanceof Error && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        trackDaily("invite_sent", {
          puzzleNumber: result.puzzleNumber,
          props: { code, source, method: "clipboard" },
        });
        toast({ title: "Invite link copied" });
      } catch {
        toast({ title: "Copy the link", description: url });
      }
    } finally {
      inviteBusyRef.current = false;
    }
  };

  /** Close the modal and hand focus back to the button that opened it. */
  const closePreview = () => {
    setPreviewOpen(false);
    window.setTimeout(() => shareBtnRef.current?.focus(), 0);
  };

  /** Send from inside the modal: the full share chain, then dismiss. */
  const sendFromPreview = async () => {
    await share();
    closePreview();
  };


  /**
   * SHARE shows the card first. When the render failed outright there is
   * nothing to show, so it goes straight down the existing text path.
   */
  const openPreview = () => {
    if (image?.status === "failed") {
      void share();
      return;
    }
    hapticTap();
    setPreviewOpen(true);
  };

  // One-shot sweep: travels the full width and exits off the far edge.
  const sweep: React.CSSProperties | null =
    sweepDelayMs === undefined
      ? null
      : ({ "--ww-sweep-delay": `${sweepDelayMs}ms` } as React.CSSProperties);

  return (
    <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SPACE[4] }}>
      {/* Share + Invite. Same slot and height as the old single button, so
          nothing below it moves. */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          alignSelf: "stretch",
          gap: SPACE[4],
        }}
      >
        <button
          type="button"
          className="ww-press"
          onClick={() => void invite("results")}
          aria-label="Invite a friend to today's puzzle"
          data-testid="results-invite"
          style={{
            ...buttonStyle("primary", "lg", { mobile }),
            flex: "1 1 0",
            minWidth: 0,
            whiteSpace: "nowrap",
            position: "relative",
            overflow: "hidden",
          }}
        >
          Invite
          {sweep && <span aria-hidden="true" className="ww-sweep-once" style={sweep} />}
        </button>
        <button
          type="button"
          ref={shareBtnRef}
          className="ww-press"
          onClick={openPreview}
          disabled={working}
          style={{
            ...buttonStyle("accent", "lg", { mobile }),
            flex: "1 1 0",
            minWidth: 0,
          }}
        >
          {working ? "Making Image…" : copied ? "Copied" : "Share"}
        </button>
      </div>


      {previewOpen && (
        <DailySharePreview
          imageUrl={image?.url ?? null}
          puzzleNumber={result.puzzleNumber}
          imageTheme={image?.theme ?? "light"}
          onSetTheme={(theme) => image?.setTheme(theme)}
          working={working}
          mobile={mobile}
          onSend={() => void sendFromPreview()}
          onInvite={() => void invite("modal")}
          onClose={closePreview}

        />
      )}

      {manual && (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE[2] }}>
          <label
            htmlFor="ww-share-manual"
            style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}
          >
            Your browser blocked the copy — select and copy this:
          </label>
          <textarea
            id="ww-share-manual"
            ref={manualRef}
            readOnly
            rows={4}
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              ...textStyle("body", mobile),
              width: "100%",
              resize: "none",
              padding: SPACE[3],
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.ink}`,
              background: COLORS.panel,
              color: COLORS.ink,
            }}
          />
        </div>
      )}
    </div>
  );
};

const DailyResultCard: React.FC<{
  puzzleNumber: number;
  attributes: ("SHAPE" | "NUMBER" | "COLOR")[];
  roundsSolved: number;
  totalMisses: number;
  roundEvents: DailyMark[][];
  peekUsed: boolean;
  peekRound: number | null;
  failed: boolean;
  shareText: string;
  /** The stored run, used to render the share image. */
  result: DailyResult;
  /** Null hides the streak line entirely — never show a zero. */
  streak: number | null;
  /**
   * The Whoop Score, read only AFTER today's run was written — otherwise the
   * change line would compare against yesterday. Null hides the block.
   */
  whoop: WhoopPoints | null;
  /** Called after an email signup so the parent can re-read streak/stats. */
  onSubscribed?: (email: string, restored: boolean) => void;
  /** Hides the signup form: an address is already on file (locally or server). */
  subscribed: boolean;
  mobile: boolean;
  revisit: boolean;
  onLeave: () => void;
}> = ({
  puzzleNumber,
  attributes,
  roundsSolved,
  totalMisses,
  roundEvents,
  peekUsed,
  peekRound,
  failed,
  shareText,
  result,
  streak,
  whoop,
  onSubscribed,
  subscribed,
  mobile,
  revisit,
  onLeave,
}) => {
  // Rendered once, here: shown in the share modal and handed to the share sheet.
  // The card defaults to whatever theme the app is in; the modal's toggle is
  // per-share and never touches the app's own theme.
  const appTheme = useThemeMode().theme;
  const shareImage = useDailyShareImage(result, streak, true, appTheme);

  // ── 10-day streak milestone ───────────────────────────────────────────────
  // Every multiple of 10, no hardcoded list. The streak read here is the same
  // number the Streak tile displays — nothing is recomputed.
  //
  // COLLISION RULE: a clean-run celebration is planned but not built. On a
  // milestone day the milestone wins and the clean-run celebration is skipped.
  const milestonePreview = isMilestonePreview();
  // Display-only nudge so `?milestone=1` can be seen without a real streak.
  // Nothing is written and no stored streak is touched.
  const shownStreak =
    milestonePreview && !isMilestoneStreak(streak) ? PREVIEW_STREAK : streak;
  const isMilestone = isMilestoneStreak(shownStreak);
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The orange tile is STATE, not animation: it applies in both motion modes.
  // Only the confetti and the shine are motion, and both are dropped entirely
  // under reduced motion — no quieter variant.
  const celebrate = isMilestone && !reducedMotion && !revisit;
  // Fires once per puzzle: revisits show the orange tile but no burst. Preview
  // never sets (or reads) the guard.
  const [burst] = React.useState(
    () => celebrate && (milestonePreview || !hasCelebrated(puzzleNumber))
  );
  React.useEffect(() => {
    if (burst && !milestonePreview) markCelebrated(puzzleNumber);
  }, [burst, milestonePreview, puzzleNumber]);

  // ── A new tier is a moment ────────────────────────────────────────────────
  // Crossing into a higher tier than the total sat in before today's game — or
  // earning a badge dated today — is marked on the block and hooked to the SAME
  // milestone confetti. No second celebration was invented. On a streak
  // milestone day the milestone burst already fired, so this adds nothing.
  const scoreChange =
    whoop !== null
      ? formatPointsChange(whoop.todayPoints, whoop.totalBeforeToday, whoop.total)
      : null;
  const badgeToday =
    whoop !== null &&
    whoop.badges.some(
      (b) => b.earnedOn === new Date().toISOString().slice(0, 10) && badgeArt(b.key) !== null
    );
  const tierUp = (scoreChange?.tierUp ?? false) || badgeToday;
  const tierBurst = tierUp && !reducedMotion && !burst && !revisit;

  const resultClass = revisit ? undefined : "ww-res-in";
  const resultMotion = (block: keyof typeof RESULT_BLOCK): React.CSSProperties =>
    revisit ? {} : blockIn(block);


  const tileLabelStyle: React.CSSProperties = {
    ...textStyle("label", mobile),
    color: COLORS.inkMuted,
  };


  /**
   * `milestone` paints the tile brand orange with the warm-black ink used on
   * accent buttons (6.53:1 for both the number and the label) and adds the
   * looping shine. Box model — border, radius, padding, flex — is identical in
   * both states, so the tile keeps its exact dimensions.
   */
  const stat = (label: string, value: string, milestone = false) => (
    <div
      key={label}
      data-testid="stat-tile"
      data-milestone={milestone ? "1" : undefined}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        border: BORDER.heavy,
        borderRadius: RADIUS.sm,
        background: milestone ? COLORS.orange : COLORS.panel,
        padding: `${SPACE[3]}px ${SPACE[2]}px`,
        textAlign: "center",
        ...(milestone ? { position: "relative", overflow: "hidden" } : null),
      }}
    >
      <div
        style={{
          ...textStyle("heading", mobile),
          color: milestone ? RAW.warmBlack : COLORS.ink,
        }}
      >
        {value}
      </div>
      <div style={{ ...tileLabelStyle, ...(milestone ? { color: RAW.warmBlack } : null) }}>
        {label}
      </div>
      {/* Looping shine — motion only, so it is omitted under reduced motion. */}
      {milestone && !reducedMotion && (
        <span aria-hidden="true" data-testid="milestone-shine" className="ww-sweep-loop" />
      )}
    </div>
  );



  // Running index of each round's first mark, so the marks read as one
  // left-to-right sequence across all three rounds.
  const markOffsets: number[] = [];
  let markCount = 0;
  for (const events of roundEvents) {
    markOffsets.push(markCount);
    markCount += Math.max(1, events.length);
  }
  const sweepDelayMs = MARKS_BASE_DELAY_MS + markCount * MARK_STAGGER_MS + MARK_IN_MS;

  return (
    <div
      className={revisit ? "ww-ui-revisit" : undefined}
      style={{
        width: "100%",
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        // Rhythm is set per block below (four tiers) rather than by one uniform
        // gap, so proximity does the grouping.
        gap: 0,
      }}
    >
      {/* Hooked to the `stats` block delay (RESULT_BLOCK.stats = 2), which is
          the block the Streak tile lives in: 2 × 40ms stagger + 250ms block-in
          = 330ms, so the burst fires as the tile lands, not on frame one. */}
      {burst && (
        <DailyMilestoneConfetti
          delayMs={RESULT_BLOCK.stats * BLOCK_STAGGER_MS + BLOCK_IN_MS}
        />
      )}
      {/* A new tier reuses the same burst, timed to the score block instead. */}
      {tierBurst && (
        <DailyMilestoneConfetti
          delayMs={RESULT_BLOCK.score * BLOCK_STAGGER_MS + BLOCK_IN_MS}
        />
      )}



      <h1
        className={resultClass}
        style={{ ...textStyle("title", mobile), color: COLORS.ink, textAlign: "center", margin: 0, ...resultMotion("heading") }}
      >
        WHOOP! WHOOP! Daily #{puzzleNumber}
      </h1>
      {/* No subhead on a completed run: the title carries it. The failed and
          revisit endings still say their one thing. */}
      {(failed || revisit) && (
        <p
          className={resultClass}
          style={{ ...textStyle("body", mobile), color: COLORS.inkMuted, textAlign: "center", margin: 0, marginTop: SPACE[6], ...resultMotion("message") }}
        >
          {failed
            ? "Whooped! Better luck tomorrow."
             : <>You already tested your memory today.<br />Come back tomorrow!</>}
        </p>
      )}
      {/* Your daily results: this run's numbers, the round rows, and the
          crowd comparison. */}
      <div
        className={resultClass}
        style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: 0, marginTop: SPACE[6], ...resultMotion("stats") }}
      >
        <h2 style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>
          Your daily results
        </h2>

        {/* Tier 1 — a label sits close to the content it names. */}
        <div style={{ display: "flex", gap: SPACE[4], alignSelf: "stretch", marginTop: SPACE[4] }}>

          {stat("Solved", `${roundsSolved}/${DAILY_ROUNDS}`)}
          {stat("Misses", `${totalMisses}`)}
          {/* Keep the three-column summary stable while the post-write streak
              read is pending. An em dash avoids inventing a zero streak. */}
          {stat(
            "Streak",
            shownStreak !== null && shownStreak >= 1
              ? `${shownStreak} ${shownStreak === 1 ? "day" : "days"}`
              : "—",
            isMilestone
          )}

        </div>
        {/* Round review rows — today's information, so they live here, without
            a heading of their own. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: SPACE[6],
          }}
        >
          {roundEvents.map((events, i) => {
            const cell: React.CSSProperties = {
              ...textStyle("caption", mobile),
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              paddingTop: SPACE[4],
              paddingBottom: SPACE[4],
            };

            return (
              <div
                key={`round-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0, 1fr) auto",
                  alignItems: "stretch",
                  columnGap: SPACE[3],
                  ...(i === 0 ? {} : { borderTop: `1px solid ${COLORS.inkMuted}` }),
                }}
              >
                <div style={{ ...cell, color: COLORS.inkMuted }}>R{i + 1}</div>
                <div style={{ ...cell, color: COLORS.ink }}>
                  {attributes[i] ? ATTR_LABEL[attributes[i]] : ""}
                </div>
                <div
                  style={{
                    ...cell,
                    justifyContent: "flex-end",
                    gap: SPACE[2],
                  }}
                >

                  {peekUsed && peekRound === i + 1 && (
                    <span aria-label="Peek used this round" title="Peek used">
                      👀
                    </span>
                  )}
                  <RoundMarks
                    events={events}
                    animateFrom={revisit ? undefined : markOffsets[i]}
                    baseDelayMs={MARKS_BASE_DELAY_MS}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Did today move me. Slotted into the same staggered entry, directly
          after today's result. Absent until the score read returns — which
          only happens after the run was written. */}
      <div
        className={resultClass}
        style={{
          alignSelf: "stretch",
          display: "flex",
          flexDirection: "column",
          marginTop: SPACE[6],
          ...resultMotion("score"),
        }}
      >
        <WhoopPointsChange points={whoop} mobile={mobile} tierUp={tierUp} />
      </div>





      {/* Tier 4 — the actions are a different kind of thing from the readout. */}
      <div className={resultClass} style={{ alignSelf: "stretch", marginTop: SPACE[6], ...resultMotion("share") }}>
        <ShareBlock
          text={shareText}
          result={result}
          streak={streak}
          mobile={mobile}
          sweepDelayMs={sweepDelayMs}
          image={shareImage}
        />
      </div>

      <button
        type="button"
        className={["ww-press", resultClass].filter(Boolean).join(" ")}
        onClick={onLeave}
        data-testid="results-done"
        style={{ ...buttonStyle("ink", "lg", { mobile }), alignSelf: "stretch", marginTop: SPACE[4], ...resultMotion("done") }}
      >
        Done
      </button>

      {!subscribed && (
        <div
          data-testid="results-email-capture"
          className={resultClass}
          style={{
            alignSelf: "stretch",
            border: BORDER.heavy,
            borderRadius: RADIUS.sm,
            background: COLORS.orange,
            padding: SPACE[6],
            display: "flex",
            flexDirection: "column",
            marginTop: SPACE[8],
            ...resultMotion("email"),
          }}
        >
          <DailyEmailCapture onSubscribed={onSubscribed} />
        </div>
      )}

    </div>
  );
};

/**
 * Shared visual base for the small icon/text chips on the ready screen.
 * `boxSizing: border-box` keeps the explicit minHeight inclusive of padding.
 */
const chipButtonBase = (mobile: boolean): React.CSSProperties => ({
  ...textStyle("chip", mobile),
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  boxSizing: "border-box",
  minHeight: 36,
  padding: "8px 16px",
  border: "none",
  borderRadius: RADIUS.sm,
});

/**
 * One gear opens the shared SettingsSheet, which holds Appearance, Sound
 * effects, Music and How to Play. Two icon buttons for two settings did not
 * scale; multiplayer carries the identical control.
 */
const DailySettingsButton: React.FC<{ mobile?: boolean; onHowTo?: () => void }> = ({
  mobile = false,
  onHowTo,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ww-press daily-btn-howto"
        onClick={() => {
          hapticTap();
          setOpen(true);
        }}
        aria-label="Settings"
        title="Settings"
        style={chipButtonBase(mobile)}
      >
        <Settings size={16} aria-hidden="true" />
      </button>
      {open && (
        <SettingsSheet
          product="daily"
          onClose={() => setOpen(false)}
          onHowTo={
            onHowTo
              ? () => {
                  setOpen(false);
                  onHowTo();
                }
              : undefined
          }
        />
      )}
    </>
  );
};


/** Ready screen — logo + daily badge, date, how-to-play chip, play CTA. */
const DailyReadyScreen: React.FC<{
  today: string;
  /** Null hides the streak line — never show a zero. */
  streak: number | null;
  /** True when today's run is already complete. */
  played?: boolean;
  /** Pre-launch gate: no playable puzzle, the CTA opens the signup overlay. */
  gated?: boolean;
  /** Already on the list — the CTA goes quiet and the date line drops. */
  subscribed?: boolean;
  /** Opens the pre-launch signup overlay. */
  onNotify?: () => void;
  /** So focus can return to the CTA when the overlay closes. */
  notifyRef?: React.Ref<HTMLButtonElement>;
  /** The address this browser remembers, or null. Drives the recognition line. */
  knownEmail?: string | null;
  /** "Not you?" — clears the local email + flag only. */
  onForgetEmail?: () => void;
  /** After a successful restore, so the streak can be re-read. */
  onRestored?: (email: string, restored: boolean) => void;
  mobile?: boolean;
  onPlay: () => void;
  onHowToPlay: () => void;
}> = ({
  today,
  streak,
  played = false,
  gated = false,
  subscribed = false,
  onNotify,
  notifyRef,
  knownEmail = null,
  onForgetEmail,
  onRestored,
  mobile = false,
  onPlay,
  onHowToPlay,
}) => {
  // Vertical compression for short viewports (Instagram in-app browser lands
  // around 480–560px). t === 1 at 700px and above, so tall phones are
  // pixel-identical to before. Everything scales before the CTA/chip do.
  const vh = useViewportHeight();
  const t = compressionFactor(vh);
  const colGap = lerpCompress(t, 12, 40);
  const pad = lerpCompress(t, 12, 24);
  const railGap = lerpCompress(t, 10, 24);
  const lockupMax = lerpCompress(t, 132, 251);
  // Never below the 44px minimum tap target.
  const ctaHeight = Math.max(56, lerpCompress(t, 56, 80));

  return (
  <DailyFrame gap={colGap} pad={pad} railGap={railGap}>
      <DailyLogoLockup style={{ maxWidth: lockupMax }} />


      <div
        className="daily-intro"
        style={{
          ...textStyle("hero", mobile),
          textAlign: "center",
          color: COLORS.ink,
        }}
      >
        {today}
        {gated && !subscribed && (
          <div
            style={{
              ...textStyle("pill", mobile),
              marginTop: 8,
              color: COLORS.inkMuted,
            }}
          >
            {`Coming ${DAILY_LAUNCH_LABEL}`}
          </div>
        )}
        {played && (
          <div style={{ marginTop: 8 }}>
            <span
              style={{
                ...textStyle("pill", mobile),
                display: "inline-block",
                padding: "8px 16px",
                borderRadius: 999,
                background: COLORS.orange,
                border: BORDER.heavy,
                // Fixed orange fill: the ink token flips cream in night mode.
                color: RAW.warmBlack,
              }}
            >
              Played today
            </span>
          </div>
        )}

        {streak !== null && streak >= 1 && (
          <div
            style={{
              ...textStyle("pill", mobile),
              marginTop: 8,
              color: COLORS.inkMuted,
            }}
          >
            {formatStreakLine(streak)}
          </div>
        )}
      </div>

      <div
        className="daily-intro"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: SPACE[3],
          animationDelay: "120ms",
        }}
      >
        <button
          type="button"
          className="ww-press daily-btn-howto"
          onClick={onHowToPlay}
          style={chipButtonBase(mobile)}
        >
          <HelpCircle size={16} aria-hidden="true" />
          How to Play
        </button>
        {/* HIDDEN: Groups chip lived here; restore when Groups ships. */}
        <DailySettingsButton mobile={mobile} onHowTo={onHowToPlay} />
      </div>

      <div className="daily-intro" style={{ width: "100%", animationDelay: "240ms" }}>
        <button
          type="button"
          ref={notifyRef}
          data-testid="daily-cta"
          className={gated && subscribed ? "daily-btn-play" : "ww-press daily-btn-play"}
          onClick={gated ? (subscribed ? undefined : onNotify) : onPlay}
          disabled={gated && subscribed}
          aria-disabled={(gated && subscribed) || undefined}
          style={{
            ...textStyle("action", mobile),
            width: "100%",
            height: ctaHeight,
            boxSizing: "border-box",
            border: BORDER.heavy,
            borderRadius: RADIUS.sm,
            // Existing disabled treatment, same as every other gated control.
            ...(gated && subscribed ? { opacity: 0.5, cursor: "default" } : null),
          }}

        >
          {gated
            ? subscribed
              ? `Coming ${DAILY_LAUNCH_LABEL}`
              : "Get the First Daily"
            : played
              ? "See Today's Result"
              : "Play Today's Daily"}
        </button>
      </div>

      {/* Recognition + legal share one wrapper so the new line costs a small
          inner gap rather than a whole column gap on short viewports. It is
          hidden pre-launch: there is no streak to restore yet. */}
      <div
        className="daily-intro"
        style={{
          width: "100%",
          animationDelay: "320ms",
          display: "flex",
          flexDirection: "column",
          gap: lerpCompress(t, 6, 12),
        }}
      >
        {!gated && (
          <DailyRecognition
            email={knownEmail}
            scale={t}
            onForget={() => onForgetEmail?.()}
            onRestored={(email, restored) => onRestored?.(email, restored)}
          />
        )}
        <DailyLegalFooter />
      </div>


  </DailyFrame>
  );
};


/**
 * Card area that scales its cards to the space it is given instead of pushing
 * the page taller. Same approach as the multiplayer board: measure the content
 * box with a ResizeObserver, then take Math.min(byWidth, byHeight) so the real
 * 5:7 card proportions are always preserved.
 */
const BOARD_COLS = 3;
const BOARD_GAP = 8;
const BOARD_RATIO = 7 / 5; // card height / card width
const BOARD_MIN_CARD_W = 44;

const DailyBoard: React.FC<{
  rows: number;
  /** Reports the measured grid width so the header can share the card edges. */
  onGridWidth?: (w: number) => void;
  children: React.ReactNode;
}> = ({ rows, onGridWidth, children }) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number, h: number) =>
      setBox((prev) =>
        Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5 ? prev : { w, h }
      );
    const rect = el.getBoundingClientRect();
    apply(rect.width, rect.height);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byWidth = (box.w - (BOARD_COLS - 1) * BOARD_GAP) / BOARD_COLS;
  // A measured height of zero (a browser that dropped a dvh declaration, or a
  // measurement taken before layout) must never collapse the board to minimum
  // cards: fall back to the viewport height instead.
  const availH =
    box.h > 0
      ? box.h
      : typeof window !== "undefined" && window.innerHeight > 0
      ? window.innerHeight
      : 0;
  const byHeight = (availH - (rows - 1) * BOARD_GAP) / rows / BOARD_RATIO;
  const raw = availH > 0 ? Math.min(byWidth, byHeight) : byWidth;
  const cardW = Math.floor(
    Math.max(BOARD_MIN_CARD_W, Number.isFinite(raw) && raw > 0 ? raw : BOARD_MIN_CARD_W)
  );
  const cardH = Math.round(cardW * BOARD_RATIO);
  const gridW = cardW * BOARD_COLS + (BOARD_COLS - 1) * BOARD_GAP;

  useEffect(() => {
    onGridWidth?.(gridW);
  }, [gridW, onGridWidth]);

  return (
    <div
      ref={ref}
      style={{
        flex: "1 1 auto",
        minHeight: 0,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${BOARD_COLS}, ${cardW}px)`,
          gridAutoRows: `${cardH}px`,
          gap: BOARD_GAP,
        }}
      >
        {children}
      </div>
    </div>
  );
};

const DailyPage: React.FC = () => {
  useBodyScrollLock();
  const mobile = useIsMobile();

  // Preload all card / die artwork on first mount so the first flip and the
  // round-intro die never flicker while SVGs decode.
  useEffect(() => {
    preloadGameArt();
  }, []);

  const daily = useDailyGame();
  const { state, phase } = daily;
  // Which How to Play mode is open: the first-run gate, or the reference chip.
  const [howTo, setHowTo] = useState<"gate" | "reference" | null>(null);
  const [showResult, setShowResult] = useState(false);
  // Pre-launch only: the signup overlay, opened from the ready-screen CTA.
  const [preLaunchSignup, setPreLaunchSignup] = useState(false);
  const notifyRef = React.useRef<HTMLButtonElement>(null);
  // Nothing is recorded under ?debug=1, same rule as daily_results.
  setDailyTrackingEnabled(!daily.debugBypass);
  // Single entry point for beginning a run: the play CTA and the stepper's
  // Start / Skip / Play controls all route through here.
  const startRun = React.useCallback(() => {
    // 600ms cue; the deal lands at 700ms, so it clears cleanly.
    playStart();
    trackDaily("run_started", { puzzleNumber: daily.puzzleNumber });
    daily.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily.start, daily.puzzleNumber]);

  // True while the round intro overlay is up: taps stay locked.
  const [introUp, setIntroUp] = useState(false);
  // Measured card-grid width: the single alignment line for the gameplay screen.
  const [gridWidth, setGridWidth] = useState(0);
  // Bumped after an email signup: the server can now fold in rows linked to
  // that address, so the streak and stats are re-read.
  const [profileKey, setProfileKey] = useState(0);
  const bumpProfile = React.useCallback(() => setProfileKey((k) => k + 1), []);
  // Local flag first, then a server check by visitor id: a cleared browser is
  // still recognised, and the local flag/email are repopulated for next time.
  const { subscribed, email: knownEmail, markLocal, forgetLocal } =
    useSubscriberStatus(bumpProfile);
  // Read after the run is persisted so today counts toward the streak.
  const dataReady = daily.resultSaved || daily.result === null;
  const { streak, loading: streakLoading } = useDailyStreakState(daily.puzzleNumber, dataReady, profileKey);
  const { percentile } = useDailyProfile(
    daily.puzzleNumber,
    dataReady,
    profileKey
  );
  // Same gate as the streak: the total is read only after the run is written,
  // so "+4 today" is the effect of today's game, not yesterday's standing.
  const { points: whoop, loading: pointsLoading } = useWhoopPointsState(dataReady, profileKey);

  // -------------------------------------------------------------------------
  // Instrumentation. Read-only observers of the engine: nothing here changes
  // a phase, a timer or a render, and every write is queued and swallowed.
  // -------------------------------------------------------------------------
  const puzzleNumber = daily.puzzleNumber;
  const readyLoggedRef = React.useRef(false);
  useEffect(() => {
    if (readyLoggedRef.current) return;
    readyLoggedRef.current = true;
    trackDaily("ready_viewed", { puzzleNumber });
  }, [puzzleNumber]);

  // Arrived from an invite link? Recorded once per browser, props only.
  useEffect(() => {
    noteInviteLanding();
  }, []);


  // Per-round outcome, derived from the round's mark list.
  const roundsLoggedRef = React.useRef<Set<number>>(new Set());
  useEffect(() => {
    state.roundEvents.forEach((events, i) => {
      const round = i + 1;
      if (roundsLoggedRef.current.has(round)) return;
      const misses = events.filter((m) => m === "MISS").length;
      if (events.includes("SOLVE")) {
        roundsLoggedRef.current.add(round);
        trackDaily("round_solved", { puzzleNumber, props: { round, misses } });
      } else if (misses >= MISSES_PER_ROUND) {
        roundsLoggedRef.current.add(round);
        trackDaily("round_failed", { puzzleNumber, props: { round, misses } });
      }
    });
  }, [state.roundEvents, puzzleNumber]);

  const peekLoggedRef = React.useRef(false);
  useEffect(() => {
    if (!state.peekUsed || peekLoggedRef.current) return;
    peekLoggedRef.current = true;
    trackDaily("peek_used", { puzzleNumber, props: { round: state.peekRound } });
  }, [state.peekUsed, state.peekRound, puzzleNumber]);

  // A run is "in progress" from the first deal until the engine reaches DONE.
  const runOpenRef = React.useRef(false);
  const runClosedRef = React.useRef(false);
  useEffect(() => {
    if (phase !== "READY" && phase !== "DONE") runOpenRef.current = true;
  }, [phase]);

  useEffect(() => {
    if (phase !== "DONE" || runClosedRef.current) return;
    if (!runOpenRef.current) return;
    runClosedRef.current = true;
    runOpenRef.current = false;
    trackDaily("run_finished", {
      puzzleNumber,
      props: {
        roundsSolved: state.roundsSolved,
        totalMisses: state.totalMisses,
      },
    });
  }, [phase, state.roundsSolved, state.totalMisses, puzzleNumber]);

  // Left mid-run: the number that says whether the game is too hard.
  useEffect(() => {
    const abandon = () => {
      if (!runOpenRef.current || runClosedRef.current) return;
      runClosedRef.current = true;
      trackDaily("run_abandoned", {
        puzzleNumber,
        props: {
          round: state.roundIndex,
          roundsSolved: state.roundsSolved,
          totalMisses: state.totalMisses,
        },
      });
      void flushDailyEvents();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") abandon();
    };
    window.addEventListener("pagehide", abandon);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", abandon);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [puzzleNumber, state.roundIndex, state.roundsSolved, state.totalMisses]);

  // --- correct-match ghost layer ---------------------------------------
  // The engine empties the solved slots the instant the claim resolves, so the
  // reward is played by copies pinned over the slots the pair just left. The
  // capture effect is declared BEFORE the board bookkeeping effect below so it
  // still sees the pre-removal board and the slots' live rects.
  const [ghost, setGhost] = useState<GhostCard[]>([]);
  // The end-of-run chain awaits the ghost layer instead of guessing at timers:
  // `awaitSettle` resolves the moment the success sequence has finished, so the
  // final reveal can never start while the pair is still celebrating.
  const settleResolveRef = React.useRef<(() => void) | null>(null);
  const settleDoneRef = React.useRef(false);
  const awaitSettle = React.useCallback(
    () =>
      settleDoneRef.current
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            settleResolveRef.current = resolve;
          }),
    []
  );

  const [finalReveal, setFinalReveal] = useState(false);
  const slotRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const boardRef = React.useRef(state.grid);

  useEffect(() => {
    if (state.matchedPair.length !== 2) return;
    const copies = state.matchedPair.flatMap<GhostCard>((i) => {
      const el = slotRefs.current[i];
      const card = boardRef.current[i];
      if (!el || !card) return [];
      const r = el.getBoundingClientRect();
      return [{
        key: `${state.roundIndex}-${i}`,
        card,
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
      }];
    });
    if (copies.length) {
      settleDoneRef.current = false;
      setGhost(copies);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.matchedPair.length, state.roundIndex]);

  useEffect(() => {
    boardRef.current = state.grid;
  }, [state.grid]);

  // --- sound + haptic cues, driven off phase / counters ---
  // Safety net: any first gesture anywhere on the page unlocks audio, in case
  // the run was started from something other than the Play button.
  const [audioReady, setAudioReady] = useState(false);
  useEffect(() => {
    const on = () => { unlockAudio(); setAudioReady(true); };
    window.addEventListener("pointerdown", on, { once: true });
    window.addEventListener("keydown", on, { once: true });
    return () => {
      window.removeEventListener("pointerdown", on);
      window.removeEventListener("keydown", on);
    };
  }, []);

  useEffect(() => {
    let diceTimer: ReturnType<typeof setTimeout> | undefined;
    // The deal-in animation mounts with the board on DEAL. The cards land at
    // the END of the move, so the single batch cue is scheduled to land with
    // the first card.
    if (phase === "DEAL") {
      playDeal(state.grid.length, { startMs: DEAL_MOVE_MS });
    }
    if (phase === "ROLL") {
      // The intro fades up first and only then starts the tumble, so the dice
      // cue waits for the tumble's first frame instead of the phase edge.
      diceTimer = setTimeout(() => playDiceRoll(), DAILY_FADE_IN_MS);
    }
    // HIDE is the end of a round (roundIndex has already advanced) except the
    // first time, where it is the cards going face down after the study window.
    if (phase === "HIDE") {
      if (state.roundIndex === 1) playFlip();
      // Round-end marker. It lives here, not on ROLL, so it never collides
      // with the dice roll of the next intro.
      else playRoundAdvance();
    }
    return () => { if (diceTimer) clearTimeout(diceTimer); };
  }, [phase, state.roundIndex, state.grid.length]);

  // Soft tick on each of the last three seconds of the study countdown.
  useEffect(() => {
    if (phase !== "STUDY") return;
    const left = daily.studyRemaining;
    if (left > 0 && left <= 3) playTick();
  }, [phase, daily.studyRemaining]);

  useEffect(() => {
    if (state.wrongToken === 0) return;
    hapticError();
    // The wrong-match animation starts on this same commit (no CSS delay), so
    // the cue fires with its first frame. The whoop landed on the second tap,
    // 450ms of claim resolution earlier, so the two never overlap.
    playWrong();
  }, [state.wrongToken]);

  useEffect(() => {
    if (state.matchedPair.length === 0) return;
    // Land the chime with the ghost treatment, not with the reveal.
    const t = setTimeout(() => {
      playCorrect();
      hapticSuccess();
    }, DAILY_MATCH_REVEAL_MS + DAILY_MATCH_HOLD_MS + GREAT_MATCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [state.matchedPair.length, state.roundIndex]);

  // Peek reveals the whole board for 5s — cue it as it opens.
  useEffect(() => {
    if (!state.peeking) return;
    playPeek();
  }, [state.peeking]);

  // End of run: one ordered chain, one cancel token (src/lib/dailyEndSequence).
  // A solved round 3 settles first (flip → hold → success → exit); only then do
  // the remaining cards flip up, hold, and hand over to the result screen.
  // `runSettled` keeps the board on screen for the whole chain.
  const [runSettled, setRunSettled] = useState(false);
  useEffect(() => {
    if (phase !== "DONE") return;
    // Round 3's own last event, not `matchedPair` — that still holds an earlier
    // round's solved pair when round 3 ends on two misses.
    const lastRound = state.roundEvents[state.roundEvents.length - 1] ?? [];
    const solved = lastRound[lastRound.length - 1] === "SOLVE";
    return runDailyEndSequence({
      solved,
      awaitSettle,
      onReveal: () => {
        setGhost([]);
        setFinalReveal(true);
        playReveal();
      },
      onResults: () => {
        hapticSuccess();
        setRunSettled(true);
        setShowResult(true);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const playedToday =
    daily.result !== null && (daily.alreadyPlayed || (phase === "DONE" && runSettled));
  const finished = playedToday && showResult;
  const ready = !finished && (phase === "READY" || playedToday);

  // Results-only release note; caller-validated point history proves return.
  const [announcementReady, setAnnouncementReady] = useState(false);
  const [announcementClosed, setAnnouncementClosed] = useState(false);
  const [earlierResult, setEarlierResult] = useState(false);
  useEffect(() => {
    if (!finished || !daily.resultSaved || pointsLoading || whoop === null || hasSeenScoreAnnouncement() || announcementClosed) return;
    let live = true;
    setEarlierResult(false);
    void fetchDailyResults(undefined, getSubscribedEmail()).then((rows) => {
      if (live) setEarlierResult(hasEarlierDailyResult(rows, daily.dateKey));
    });
    return () => { live = false; };
  }, [finished, daily.resultSaved, pointsLoading, whoop, daily.dateKey, profileKey, announcementClosed]);

  // Use the same milestones, delays, and confetti lifetime as DailyResultCard.
  // Wait for the latest possible burst, then for the final result block entry.
  const reducedResultMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // Conservatively wait even if this streak already celebrated; the child may
  // have set its once-per-day guard during the same results entry.
  const streakBurst = (isMilestoneStreak(streak?.current ?? null) || isMilestonePreview()) &&
    !daily.alreadyPlayed && !reducedResultMotion;
  const scoreMilestone = whoop !== null && (
    formatPointsChange(whoop.todayPoints, whoop.totalBeforeToday, whoop.total).tierUp ||
    whoop.badges.some((badge) => badge.earnedOn === new Date().toISOString().slice(0, 10) && badgeArt(badge.key) !== null)
  );
  const scoreBurst = scoreMilestone && !daily.alreadyPlayed && !reducedResultMotion;
  useEffect(() => {
    if (!finished || pointsLoading || streakLoading || !isReturningScorePlayer(whoop, daily.resultSaved, earlierResult) ||
        hasSeenScoreAnnouncement() || announcementClosed) return;
    setAnnouncementReady(false);
    const entryEnd = daily.alreadyPlayed ? UI_REVISIT_MS :
      reducedResultMotion ? BLOCK_IN_MS : RESULT_BLOCK.email * BLOCK_STAGGER_MS + BLOCK_IN_MS;
    const confettiEnd = Math.max(
      streakBurst ? RESULT_BLOCK.stats * BLOCK_STAGGER_MS + BLOCK_IN_MS + BURST_LIFETIME_MS : 0,
      scoreBurst ? RESULT_BLOCK.score * BLOCK_STAGGER_MS + BLOCK_IN_MS + BURST_LIFETIME_MS : 0,
    );
    const timer = window.setTimeout(() => setAnnouncementReady(true), Math.max(entryEnd, confettiEnd));
    return () => window.clearTimeout(timer);
  }, [finished, daily.resultSaved, pointsLoading, streakLoading, whoop, earlierResult, streakBurst, scoreBurst, daily.alreadyPlayed, reducedResultMotion, announcementClosed]);
  const showScoreAnnouncement = finished && announcementReady &&
    !announcementClosed && !pointsLoading && isReturningScorePlayer(whoop, daily.resultSaved, earlierResult);
  const announcementShownRef = React.useRef(false);
  useEffect(() => {
    if (!showScoreAnnouncement || announcementShownRef.current) return;
    announcementShownRef.current = true;
    trackDaily("announcement_shown", { puzzleNumber: daily.puzzleNumber, props: { version: SCORE_ANNOUNCEMENT.version } });
  }, [showScoreAnnouncement, daily.puzzleNumber]);

  // Back from Your Stats / Groups with today's result already saved: land
  // straight on the results screen instead of asking for the ready screen's
  // "See Today's Result" tap again.
  const location = useLocation();
  useEffect(() => {
    const fromResults =
      (location.state as { wwOpenResult?: boolean } | null)?.wwOpenResult === true;
    if (fromResults && daily.alreadyPlayed && daily.result !== null) {
      setShowResult(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, daily.alreadyPlayed, daily.result]);

  // Background theme: ready (intro) and results screens only. It fades out the
  // moment the run starts and fades back in when the result screen opens. The
  // loop keeps running underneath so it never restarts from the top.
  // `startTheme()` is safe to call before a gesture — it records the intent and
  // the theme fades in as soon as `unlockAudio()` runs.
  useEffect(() => {
    if (ready || finished) startTheme();
    else stopTheme();
  }, [audioReady, ready, finished]);

  // Begin fetching the Daily theme on mount so the first note isn't waiting
  // on the download when the ready/results screens start it.
  useEffect(() => {
    prewarmTheme();
    return () => stopTheme();
  }, []);

  const readout = (() => {
    switch (phase) {
      case "DEAL":
        return "Dealing…";
      case "STUDY":
        return `Memorize: ${daily.studyRemaining}`;
      case "HIDE":
        return "Cards down";
      case "ROLL":
        return "Rolling…";
      case "WHOOPED":
        return "Whooped!";
      default:
        // No resting die any more: the readout is the only rule reminder.
        return state.peeking
          ? "Peeking…"
          : ATTR_LABEL[daily.roll.attribute] ?? "\u00A0";
    }
  })();

  // During PLAY a card tap *is* the claim: no button, no intermediate states.
  // Both settle sequences (wrong shake, match ghost) lock the board.
  const cardsTappable =
    phase === "PLAY" &&
    !introUp &&
    !state.peeking &&
    state.selected.length < 2 &&
    state.wrongPair.length === 0 &&
    ghost.length === 0;

  // Arrow keys walk focus across the 3-column board; Enter/Space on a card
  // selects and then claims (handled by GameCard's own key handler).
  const boardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -BOARD_COLS,
      ArrowDown: BOARD_COLS,
    };
    const delta = step[e.key];
    if (delta === undefined) return;
    const total = state.grid.length;
    if (total === 0) return;

    const focusable = (i: number) =>
      slotRefs.current[i]?.querySelector<HTMLElement>('[role="button"]') ?? null;

    const active = document.activeElement as HTMLElement | null;
    const slot = active?.closest?.("[data-slot]") as HTMLElement | null;
    const from = slot ? Number(slot.dataset.slot) : -1;

    e.preventDefault();

    if (from < 0) {
      for (let i = 0; i < total; i++) {
        const el = focusable(i);
        if (el) { el.focus(); return; }
      }
      return;
    }

    // Walk in the requested direction, skipping empty slots, and stop at the edges.
    for (let i = from + delta; i >= 0 && i < total; i += delta) {
      // Horizontal moves must not jump rows.
      if (Math.abs(delta) === 1 && Math.floor(i / BOARD_COLS) !== Math.floor(from / BOARD_COLS)) break;
      const el = focusable(i);
      if (el) { el.focus(); return; }
    }
  };

  const [ty, tm, td] = daily.dateKey.split("-").map(Number);
  const today = new Date(ty, tm - 1, td).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <Helmet>
        <title>{daily.preLaunch ? `WHOOP! WHOOP! — Daily Memory Game` : `Daily Game #${daily.puzzleNumber} | WHOOP! WHOOP! — Daily Memory Game`}</title>
        <meta
          name="description"
          content="Play the free WHOOP! WHOOP! daily memory game. Nine cards, ten seconds, three rounds, two misses a round. A new memory challenge every day—no signup needed."
        />
        <meta property="og:title" content={daily.preLaunch ? "WHOOP! WHOOP! — Daily Memory Game" : `WHOOP! WHOOP! — Daily Memory Game | Daily Game #${daily.puzzleNumber}`} />
        <meta
          property="og:description"
          content="Play the free WHOOP! WHOOP! daily memory game. Nine cards, ten seconds, three rounds, two misses a round. A new memory challenge every day—no signup needed."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://whoop-whoop.com/" />
        <meta property="og:image" content="https://whoop-whoop.com/og-daily.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="WHOOP! WHOOP! — Nine cards. Ten seconds. Then the rules change."
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://whoop-whoop.com/og-daily.png" />
      </Helmet>

      <DailyScreenFade
        screenKey={finished ? "result" : ready ? "ready" : "play"}
        background={finished || ready ? COLORS.surface : COLORS.panel}
      >
        {daily.debugBypass && (
          <div
            role="status"
            style={{
              position: "fixed",
              top: 4,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 9999,
              padding: "2px 8px",
              borderRadius: 999,
              background: COLORS.red,
              color: RAW.cream,
              fontSize: 10,
              fontWeight: FONT_WEIGHT_UI,
              letterSpacing: "0.08em",
              pointerEvents: "none",
            }}
          >
            {`DEBUG — ${
              daily.debugOverride === "seed"
                ? "SEED OVERRIDE"
                : daily.debugOverride === "day"
                  ? `DAY OFFSET → ${daily.dateKey}`
                  : "LOCK BYPASSED"
            } · SEED ${daily.seed} · #${daily.puzzleNumber} · NOT A REAL RUN`}
          </div>
        )}
        {ready && (
          <>
            <DailyReadyScreen
              mobile={mobile}
              today={today}
              streak={streak?.current ?? null}
              played={playedToday}
              gated={daily.preLaunch}
              subscribed={subscribed}
              notifyRef={notifyRef}
              knownEmail={knownEmail}
              onForgetEmail={() => {
                forgetLocal();
                // The streak/stats reads must drop the email union too.
                bumpProfile();
              }}
              onRestored={(email) => {
                markLocal(email);
                void daily.recheckEmail(email);
                bumpProfile();
              }}
              onNotify={() => {
                unlockAudio();
                setAudioReady(true);
                hapticTap();
                setPreLaunchSignup(true);
              }}
              onPlay={() => {
                // First user gesture on the page: resume the AudioContext and
                // kick off the clip decode, or nothing ever plays.
                unlockAudio();
                setAudioReady(true);
                hapticTap();
                if (playedToday) setShowResult(true);
                // First ever run: the stepper gates the start. Skip / Start
                // both begin the run, so nobody is trapped.
                else if (!hasSeenHowTo()) setHowTo("gate");
                else startRun();
              }}

              onHowToPlay={() => {
                // Any tap on the ready screen also opens the audio path, so the
                // theme has a window in which to start.
                unlockAudio();
                setAudioReady(true);
                startTheme();
                hapticTap();
                setHowTo("reference");
              }}

            />
            {howTo && (
              <DailyHowToSteps
                mode={howTo}
                mobile={mobile}
                onStart={() => {
                  setHowTo(null);
                  startRun();
                }}
                onClose={() => setHowTo(null)}
              />
            )}
            {preLaunchSignup && (
              <DailyPreLaunchSignup
                onClose={() => {
                  setPreLaunchSignup(false);
                  notifyRef.current?.focus();
                }}
                onSubscribed={(email) => {
                  markLocal(email);
                void daily.recheckEmail(email);
                  bumpProfile();
                }}
              />
            )}
          </>
        )}
        {!ready && (
        <DailyFrame gap={SPACE[4]} fill={!finished} tone={finished ? "surface" : "panel"}>

          {finished ? (
            <DailyResultCard
              puzzleNumber={daily.result!.puzzleNumber}
              attributes={daily.result!.attributes}
              roundsSolved={daily.result!.roundsSolved}
              totalMisses={daily.result!.totalMisses}
              roundEvents={daily.result!.roundEvents}
              peekUsed={daily.result!.peekUsed}
              peekRound={daily.result!.peekRound}
              failed={daily.result!.failed}
              shareText={formatDailyShare(
                daily.result!,
                streak?.current ?? null,
                percentile
              )}
              result={daily.result!}
              streak={streak?.current ?? null}
              whoop={whoop}
              subscribed={subscribed}
              onSubscribed={(email) => {
                // Restore or fresh signup, either way: the address is now on
                // file, so the lifetime block and streak re-read immediately.
                markLocal(email);
                void daily.recheckEmail(email);
                bumpProfile();
              }}

              mobile={mobile}
              revisit={daily.alreadyPlayed}
              onLeave={() => {
                hapticTap();
                setShowResult(false);
              }}
            />
          ) : ready ? null : (
            <div
              onKeyDown={boardKeyDown}
              style={{
                width: "100%",
                alignSelf: "stretch",
                flex: "1 1 auto",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                gap: SPACE[4],
              }}
            >

              <div
                style={{
                  flex: "0 0 auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: SPACE[3],
                  width: gridWidth ? gridWidth : "100%",
                  alignSelf: "center",
                }}
              >
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}>
                    Round {state.roundIndex} of {DAILY_ROUNDS} · {remainingCount(state)} cards
                  </div>
                  <div
                    aria-live="polite"
                    style={{
                      ...textStyle("title", mobile),
                      color: COLORS.ink,
                      fontVariantNumeric: "tabular-nums",
                      minHeight: "1.2em",
                    }}
                  >
                    {readout}
                  </div>
                  <div style={{ marginTop: SPACE[2] }}>
                    <MissTracker used={state.roundMisses} />
                  </div>
                </div>
                <button
                  type="button"
                  className="ww-press"
                  disabled={!daily.canPeek}
                  onClick={() => {
                    hapticTap();
                    daily.peek();
                  }}
                  style={{
                    ...buttonStyle("secondary", "sm", {
                      mobile,
                      disabled: !daily.canPeek,
                    }),
                    whiteSpace: "nowrap",
                    flex: "0 0 auto",
                  }}
                >
                  {state.peekUsed ? "Peek Used" : "Peek (5s)"}
                </button>
              </div>

              <DailyBoard
                rows={Math.max(1, Math.ceil(state.grid.length / 3))}
                onGridWidth={setGridWidth}
              >
                {state.grid.map((card, idx) => (
                  // Persistent slot wrapper: it outlives the card, so the
                  // ghost layer can still measure the slot a solved pair left.
                  <div
                    key={`slot-${idx}`}
                    data-slot={idx}
                    ref={(el) => { slotRefs.current[idx] = el; }}
                    style={{ position: "relative", width: "100%", height: "100%" }}
                  >
                    {card === null ? (
                      <div
                        aria-hidden="true"
                        style={{
                          height: "100%",
                          borderRadius: RADIUS.sm,
                          border: `2px dashed ${COLORS.inkMuted}`,
                          opacity: 0.25,
                        }}
                      />
                    ) : (
                      <GameCard
                        card={card}
                        fill
                        faceUp={state.faceUp || finalReveal}
                        highlighted={state.selected.includes(idx)}
                        matched={state.matchedPair.includes(idx)}
                        wrong={state.wrongPair.includes(idx)}
                        interactive={cardsTappable}
                        dealIndex={idx}
                        dealKey={daily.seed}
                        onClick={() => {
                          // Paint the selection first; haptics and sound are
                          // best-effort and can block, so they follow.
                          const calls = state.selected.length === 1 && !state.selected.includes(idx);
                          const selects = state.selected.length === 0;
                          const deselects = state.selected.includes(idx);
                          daily.select(idx);
                          hapticTap();
                          if (calls) playWhoopCall();
                          else if (deselects) playDeselect();
                          else if (selects) playSelect();
                        }}

                      />
                    )}
                  </div>
                ))}
              </DailyBoard>

              {ghost.length > 0 && (
                <DailyMatchGhost
                  pair={ghost}
                  onDone={() => {
                    settleDoneRef.current = true;
                    settleResolveRef.current?.();
                    settleResolveRef.current = null;
                    setGhost([]);
                  }}

                />
              )}

              {/* Fixed overlay: never affects the board's measured size. */}
              <DailyRoundIntro
                active={phase === "ROLL"}
                roundIndex={state.roundIndex}
                attribute={daily.roll.attribute}
                faceIndex={daily.roll.faceIndex}
                tumbleSeed={daily.tumbleSeed}
                onVisibleChange={setIntroUp}
              />
            </div>
          )}

        </DailyFrame>
        )}
      </DailyScreenFade>
      {showScoreAnnouncement && whoop && (
        <WhoopScoreAnnouncement
          points={whoop}
          puzzleNumber={daily.puzzleNumber}
          onClose={() => setAnnouncementClosed(true)}
        />
      )}
    </>
  );
};

export default DailyPage;
