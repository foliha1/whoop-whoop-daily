import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { afterFirstContent } from "@/lib/deferredWork";
import { Helmet } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-context";
import { COLORS } from "@/lib/tokens";
import { UI_EASE, UI_ENTER_MS, UI_EXIT_MS } from "@/lib/animationTiming";
import CardFlipLoader from "@/components/CardFlipLoader";
import SpookGhost from "@/components/SpookGhost";
import Holo100Splash from "@/components/Holo100Splash";
import { useUmbrella } from "@/lib/launch";
import { enterThemeZone, leaveThemeZone, CLASSIC_THEME_FILE } from "@/lib/sounds";

const INSTALL_ASSET_VERSION = "20260925";

import DebugOnlyRoute from "./components/DebugOnlyRoute.tsx";
import RouteErrorBoundary from "./components/RouteErrorBoundary.tsx";

/**
 * After a new build, an open tab may still ask for old hashed page files that
 * no longer exist. Reload once to pick up the fresh build instead of a blank
 * screen; the session flag prevents a reload loop if the file is truly gone.
 */
const RELOAD_FLAG = "ww_chunk_reload";
const reloadOnceForStaleChunk = (): boolean => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
};
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadOnceForStaleChunk()) event.preventDefault();
  });
  window.addEventListener("load", () => {
    window.setTimeout(() => {
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
    }, 10_000);
  });
}
function lazyPage<T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((error) => {
      if (reloadOnceForStaleChunk()) return new Promise<{ default: T }>(() => {});
      throw error;
    }),
  );
}

const loadMultiplayerPage = () => import("./pages/MultiplayerPage.tsx");
const MultiplayerPage = lazyPage(loadMultiplayerPage);
const loadDailyPage = () => import("./pages/DailyPage.tsx");
const DailyPage = lazyPage(loadDailyPage);
const loadSupportPage = () => import("./pages/SupportPage.tsx");
const SupportPage = lazyPage(loadSupportPage);
const loadRulesPage = () => import("./pages/RulesPage.tsx");
const RulesPage = lazyPage(loadRulesPage);
const loadPreorderPage = () => import("./pages/PreorderPage.tsx");
const PreorderPage = lazyPage(loadPreorderPage);
const AdminPage = lazyPage(() => import("./pages/AdminPage.tsx"));
const GroupsPage = lazyPage(() => import("./pages/GroupsPage.tsx"));
const YouPage = lazyPage(() => import("./pages/YouPage.tsx"));
const PrivacyPage = lazyPage(() => import("./pages/PrivacyPage.tsx"));
const TermsPage = lazyPage(() => import("./pages/TermsPage.tsx"));
const loadFaqPage = () => import("./pages/FaqPage.tsx");
const FaqPage = lazyPage(loadFaqPage);

/**
 * Editorial pages reached by in-app links. During a route change their code
 * is fetched while the old page fades out, so the new page fades in already
 * built instead of flashing a blank fallback and then popping in.
 */
const ROUTE_PRELOAD: Record<string, () => Promise<unknown>> = {
  // Game screens too: on a slow phone the old page fades out while their code
  // arrives, instead of a blank fallback flashing between the two.
  "/": loadMultiplayerPage,
  "/daily": loadDailyPage,
  "/classic": loadMultiplayerPage,
  "/classic.html": loadMultiplayerPage,
  "/preorder": loadPreorderPage,
  "/rules": loadRulesPage,
  "/about": loadSupportPage,
  "/faq": loadFaqPage,
};
/** Longest a route change waits for page code before showing the fallback. */
const ROUTE_PRELOAD_MAX_MS = 900;
const NotFound = lazyPage(() => import("./pages/NotFound.tsx"));



/** Legacy /play and /play/:roomCode → /classic?r=CODE, code preserved. */
const ClassicRedirect: React.FC = () => {
  const { roomCode } = useParams<{ roomCode?: string }>();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (roomCode && !params.get("r")) params.set("r", roomCode);
  const qs = params.toString();
  return <Navigate to={`/classic${qs ? `?${qs}` : ""}`} replace />;
};

const ProductInstallHead: React.FC = () => {
  const { pathname } = useLocation();
  const umbrella = useUmbrella();
  const classic = pathname === "/classic.html" || pathname === "/classic" || pathname.startsWith("/classic/");
  const home = umbrella && pathname === "/";
  const product = classic ? "classic" : home ? "home" : "daily";
  const title = classic ? "Whoop! Whoop! Classic" : home ? "Whoop! Whoop!" : "Whoop! Whoop! Daily";
  const themeColor = classic ? "#231F20" : "#F8F2E9";

  // Keep exactly one canonical and one og:url per page: a page's own tag
  // replaces the static homepage one; pages without one get their own address.
  useEffect(() => {
    const href = `https://whoop-whoop.com${pathname === "/" ? "/" : pathname.replace(/\/$/, "")}`;
    const sync = () => {
      const own = document.head.querySelector('link[rel="canonical"][data-rh]');
      const fallback = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]:not([data-rh])');
      if (own) fallback?.remove();
      else if (fallback) fallback.href = href;
      else {
        const link = document.createElement("link");
        link.rel = "canonical";
        link.href = href;
        document.head.appendChild(link);
      }

      const ownOg = document.head.querySelector('meta[property="og:url"][data-rh]');
      const fallbackOg = document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]:not([data-rh])');
      if (ownOg) fallbackOg?.remove();
      else if (fallbackOg) fallbackOg.content = href;
      else {
        const meta = document.createElement("meta");
        meta.setAttribute("property", "og:url");
        meta.content = href;
        document.head.appendChild(meta);
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.head, { childList: true });
    sync();
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <Helmet>
      <link rel="icon" href={home ? "/icons/home/favicon-32.png?v=20260929" : `/icons/${product}/favicon-32.png?v=${INSTALL_ASSET_VERSION}`} sizes="32x32" type="image/png" />
      <link rel="icon" href={home ? "/icons/home/favicon-16.png?v=20260929" : `/icons/${product}/favicon-16.png?v=${INSTALL_ASSET_VERSION}`} sizes="16x16" type="image/png" />
      <link rel="apple-touch-icon" href={home ? "/icons/home/apple-touch-icon.png?v=20260929" : `/icons/${product}/apple-touch-icon.png?v=${INSTALL_ASSET_VERSION}`} sizes="180x180" />
      <link rel="manifest" href={`/${product}.webmanifest?v=${home ? "20260929" : INSTALL_ASSET_VERSION}`} />
      <meta name="apple-mobile-web-app-title" content={title} />
      <meta name="theme-color" content={themeColor} />
      <meta property="og:url" content={`https://whoop-whoop.com${pathname === "/" ? "/" : pathname.replace(/\/$/, "")}`} />
    </Helmet>
  );
};

const EntryRouteMusic: React.FC = () => {
  useEffect(() => {
    enterThemeZone(CLASSIC_THEME_FILE);
    return () => leaveThemeZone();
  }, []);
  return null;
};

const AnimatedRoutes: React.FC = () => {
  const location = useLocation();
  const umbrella = useUmbrella();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [stage, setStage] = useState<"fadeIn" | "fadeOut">("fadeIn");

  const path = displayLocation.pathname;
  const entryMusic = umbrella && path !== "/" && path !== "/daily" && path !== "/today" && path !== "/you" && !path.startsWith("/classic") && !path.startsWith("/play");

  useEffect(() => {
    if (location.key === displayLocation.key) return;
    setStage("fadeOut");
    let cancelled = false;
    const load = ROUTE_PRELOAD[location.pathname.replace(/\/$/, "") || "/"];
    const ready = load
      ? Promise.race([
          load().catch(() => undefined),
          new Promise((r) => window.setTimeout(r, ROUTE_PRELOAD_MAX_MS)),
        ])
      : Promise.resolve();
    const exited = new Promise((r) => window.setTimeout(r, UI_EXIT_MS));
    void Promise.all([ready, exited]).then(() => {
      if (cancelled) return;
      setDisplayLocation(location);
      setStage("fadeIn");
    });
    return () => { cancelled = true; };
  }, [location, displayLocation]);

  // The pre-order page is one tap from Home (IRL, the pre-order note): fetch
  // its code once the current page has painted and gone idle.
  // Once the current page has painted and gone idle, warm what the next tap
  // most likely needs: the game screens' code and the card back and die art,
  // so a game opens with its cards already drawn.
  useEffect(() => afterFirstContent(() => {
    void loadPreorderPage().catch(() => undefined);
    void loadDailyPage().catch(() => undefined);
    void loadMultiplayerPage().catch(() => undefined);
    void import("@/lib/preloadArt").then((m) => m.preloadEssentialGameArt()).catch(() => undefined);
  }), []);

  return (
    <div
      className="page-transition"
      style={{
        opacity: stage === "fadeIn" ? 1 : 0,
        transition: `opacity ${stage === "fadeIn" ? UI_ENTER_MS : UI_EXIT_MS}ms ${UI_EASE}`,
        minHeight: "var(--ww-vh)",
      }}
    >
      <RouteErrorBoundary resetKey={displayLocation.key}>
      <Suspense
        fallback={(
          <div
            aria-hidden="true"
            style={{ minHeight: "var(--ww-vh)", background: COLORS.surface }}
          />
        )}
      >
        <Routes location={displayLocation}>
          <Route path="/" element={umbrella ? <MultiplayerPage home /> : <DailyPage />} />
          <Route path="/daily" element={umbrella ? <DailyPage /> : <Navigate to={`/${location.search}`} replace />} />
          <Route path="/today" element={umbrella ? <Navigate to={`/daily${location.search}`} replace /> : <DailyPage />} />
          {/* Groups remains available for testing under ?debug=1 only. */}
          <Route path="/groups" element={<DebugOnlyRoute><Suspense fallback={<CardFlipLoader label="Loading Groups" layout="page" />}><GroupsPage /></Suspense></DebugOnlyRoute>} />
          {/* The player's long-term self. Not indexed, same as groups. */}
          <Route path="/you" element={<Suspense fallback={<CardFlipLoader label="Loading Your Stats" layout="page" />}><YouPage /></Suspense>} />
          <Route path="/about" element={<SupportPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/preorder" element={<PreorderPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/admin" element={<AdminPage />} />



          {/* Classic lives at /classic. The .html twin is the document the host
              actually serves with Classic link-preview tags (see
              scripts/classicHead.mjs), so it must render the game too. */}
          <Route path="/classic" element={<MultiplayerPage />} />
          <Route path="/classic.html" element={<MultiplayerPage />} />
          <Route path="/classic/:roomCode" element={<MultiplayerPage />} />
          {/* Legacy /play links redirect, preserving the room code. */}
          <Route path="/play" element={<ClassicRedirect />} />
          <Route path="/play/:roomCode" element={<ClassicRedirect />} />
          {/* Debug-gated routes: 404 in production, live under ?debug=1. */}
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        {entryMusic ? <EntryRouteMusic key={path} /> : null}
      </Suspense>
      </RouteErrorBoundary>
    </div>
  );
};


const App = () => (
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ProductInstallHead />
          <AnimatedRoutes />
          <SpookGhost />
          <Holo100Splash />
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
);

export default App;
