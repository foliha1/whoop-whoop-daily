import { Helmet } from "react-helmet-async";
import { useParams, useSearchParams } from "react-router-dom";
import React, { Suspense, useEffect, useState } from "react";
import { COLORS, SPACE } from "@/lib/tokens";
import DailyShapeRule from "@/components/DailyShapeRule";
import { SITE_HEADER_OFFSET } from "@/components/SiteHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
const IntroAnimation = React.lazy(() => import("@/components/IntroAnimation"));
import { hasSeenIntro, preloadIntroJson } from "@/components/IntroAnimation";
import whoopLightLogo from "@/assets/WhoopWhoop_Light_Logo.svg.asset.json";


// TODO: Temporary intro QA override — set to false to restore once-per-visitor behavior.
const FORCE_INTRO_EVERY_RELOAD_FOR_TESTING = true;

// Kick off the download as early as possible: the moment this module
// evaluates, before the component mounts. The index.html <link rel="preload">
// has already started the fetch — this just latches the promise.
preloadIntroJson();

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

const MultiplayerWindow = React.lazy(() => import("@/components/MultiplayerWindow"));

type IntroStatus = "pending" | "running" | "skipped" | "complete" | "timeout" | "none";

const MultiplayerPage: React.FC = () => {
  useBodyScrollLock();
  const { roomCode } = useParams<{ roomCode?: string }>();
  const [searchParams] = useSearchParams();
  const modeParam = searchParams.get("mode");
  const initialMode = modeParam === "solo" || modeParam === "multiplayer" ? modeParam : undefined;
  const mobile = useIsMobile();

  const initialIntroStatus = (): IntroStatus => {
    const alreadySeen = hasSeenIntro();
    if (!FORCE_INTRO_EVERY_RELOAD_FOR_TESTING && alreadySeen) {
      return "none";
    }
    if (prefersReducedMotion()) {
      return "skipped";
    }
    return "pending";
  };
  const [introStatus, setIntroStatus] = useState<IntroStatus>(initialIntroStatus);
  const [introData, setIntroData] = useState<unknown | null>(null);

  // Preload the logo image for the match-cut.
  useEffect(() => {
    const img = new Image();
    img.src = whoopLightLogo.url;
  }, []);

  // Wait for the intro JSON — no short-timer bail. Load times vary wildly on
  // the same connection, so any small cutoff drops the intro at random. The
  // safety net inside IntroAnimation covers the "started but never finished"
  // case; here we just wait.
  useEffect(() => {
    if (introStatus !== "pending") return;
    let cancelled = false;
    preloadIntroJson().then((json) => {
      if (cancelled) return;
      if (json) {
        setIntroData(json);
        setIntroStatus("running");
      } else {
        setIntroStatus("skipped");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [introStatus]);

  // The intro is a one-shot overlay with its own dark ground. Once it is done
  // it unmounts: the page ground is the themed solid plus the pattern strips,
  // with nothing behind the content.
  const introMounted = introStatus === "running";
  // Hide the lobby entirely until the intro decision has resolved. Otherwise
  // the lobby paints first and gets hidden a frame later when the intro
  // mounts — a visible flash.
  const lobbyVisible = introStatus !== "pending";

  const title = "Multiplayer — WHOOP! WHOOP!";
  const description =
    "Play WHOOP! WHOOP! online with friends. Start a table, share the link, and match cards under the die.";

  const handleIntroDone = (reason: "complete" | "skip" | "timeout" | "error") => {
    if (reason === "complete") setIntroStatus("complete");
    else if (reason === "skip") setIntroStatus("skipped");
    else if (reason === "timeout") setIntroStatus("timeout");
    else setIntroStatus("none");
  };

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
      </Helmet>
      <div
        className="mp-page-root"
        role="main"
        aria-label="WHOOP! WHOOP! multiplayer"
        style={{
          height: "var(--ww-vh)",
          width: "100%",
          overflow: "hidden",
          position: "relative",
          isolation: "isolate",
          backgroundColor: COLORS.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        {/* Brand pattern strip top and bottom, exactly as the Daily frames its
            screens: solid themed ground, nothing behind the content. */}
        <div
          style={{
            position: "absolute",
            top: `calc(${SITE_HEADER_OFFSET} + ${SPACE[12]}px)`,
            left: SPACE[12],
            right: SPACE[12],
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          <DailyShapeRule />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: `calc(${SPACE[12]}px + env(safe-area-inset-bottom))`,
            left: SPACE[12],
            right: SPACE[12],
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          <DailyShapeRule />
        </div>

        {/* IntroAnimation lives INSIDE .mp-page-root so that when it drops to
            z-index:-1 in the persistent phase it paints behind the lobby
            content but still in front of this container's own dark bg,
            rather than being occluded by it (which happens when the overlay
            is a sibling to an isolated, opaque parent). */}
        {introMounted && (
          <Suspense fallback={null}>
            <IntroAnimation preloadedData={introData} onDone={handleIntroDone} />
          </Suspense>
        )}

        <div
          style={{
            width: "100%",
            maxWidth: 420,
            height: "auto",
            maxHeight: 900,
            margin: "auto",
            padding: mobile
              ? 0
              : "calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left))",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            visibility: lobbyVisible ? "visible" : "hidden",
          }}
        >
          <Suspense fallback={<div style={{ margin: "auto", color: COLORS.ink }}>Loading…</div>}>
            <MultiplayerWindow
              initialRoomCode={roomCode}
              initialMode={initialMode}
              introStatus={introStatus === "pending" ? "running" : introStatus}
            />

          </Suspense>
        </div>
      </div>
    </>
  );
};

export default MultiplayerPage;

