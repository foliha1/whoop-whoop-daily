import { Helmet } from "react-helmet-async";
import { useParams, useSearchParams } from "react-router-dom";
import React, { Suspense, useEffect, useState } from "react";
import { COLORS } from "@/lib/tokens";
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

  const title = "WHOOP! WHOOP! Classic";

  // Set the tab title by mutating the existing <title> element in place —
  // a Helmet <title> would append a second tag alongside index.html's.
  // Route meta (description, og:*) is intentionally NOT emitted here: the
  // static index.html tags are the single set, and this route is noindex.
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, []);

  const handleIntroDone = (reason: "complete" | "skip" | "timeout" | "error") => {
    if (reason === "complete") setIntroStatus("complete");
    else if (reason === "skip") setIntroStatus("skipped");
    else if (reason === "timeout") setIntroStatus("timeout");
    else setIntroStatus("none");
  };

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div
        className="mp-page-root"
        role="main"
        aria-label="WHOOP! WHOOP! Classic"
        style={{
          height: "var(--ww-vh)",
          width: "100%",
          overflow: "hidden",
          position: "relative",
          isolation: "isolate",
          backgroundColor: COLORS.surface,
          boxSizing: "border-box",
        }}
      >
        {/* The ground, the brand pattern strips and the centred column all come
            from the entry screens' DailyFrame (and from GameShell in play), so
            this page only supplies the viewport and the intro overlay. */}
        {introMounted && (
          <Suspense fallback={null}>
            <IntroAnimation preloadedData={introData} onDone={handleIntroDone} />
          </Suspense>
        )}

        <div style={{ height: "100%", visibility: lobbyVisible ? "visible" : "hidden" }}>
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

