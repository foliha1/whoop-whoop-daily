import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-context";
import { COLORS } from "@/lib/tokens";
import { UI_EASE, UI_ENTER_MS, UI_EXIT_MS } from "@/lib/animationTiming";
import CardFlipLoader from "@/components/CardFlipLoader";
import SpookGhost from "@/components/SpookGhost";
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

const MultiplayerPage = lazyPage(() => import("./pages/MultiplayerPage.tsx"));
const DailyPage = lazyPage(() => import("./pages/DailyPage.tsx"));
const SupportPage = lazyPage(() => import("./pages/SupportPage.tsx"));
const AdminPage = lazyPage(() => import("./pages/AdminPage.tsx"));
const GroupsPage = lazyPage(() => import("./pages/GroupsPage.tsx"));
const YouPage = lazyPage(() => import("./pages/YouPage.tsx"));
const TypographyPage = lazyPage(() => import("./pages/TypographyPage.tsx"));
const PrivacyPage = lazyPage(() => import("./pages/PrivacyPage.tsx"));
const TermsPage = lazyPage(() => import("./pages/TermsPage.tsx"));
const FaqPage = lazyPage(() => import("./pages/FaqPage.tsx"));
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
  const title = classic ? "WHOOP! WHOOP! Classic" : home ? "WHOOP! WHOOP!" : "WHOOP! WHOOP! Daily";
  const themeColor = classic ? "#231F20" : "#F8F2E9";

  return (
    <Helmet>
      <link rel="icon" href={home ? "/icons/home/favicon-32.png?v=20260929" : `/icons/${product}/favicon-32.png?v=${INSTALL_ASSET_VERSION}`} sizes="32x32" type="image/png" />
      <link rel="icon" href={home ? "/icons/home/favicon-16.png?v=20260929" : `/icons/${product}/favicon-16.png?v=${INSTALL_ASSET_VERSION}`} sizes="16x16" type="image/png" />
      <link rel="apple-touch-icon" href={home ? "/icons/home/apple-touch-icon.png?v=20260929" : `/icons/${product}/apple-touch-icon.png?v=${INSTALL_ASSET_VERSION}`} sizes="180x180" />
      <link rel="manifest" href={`/${product}.webmanifest?v=${home ? "20260929" : INSTALL_ASSET_VERSION}`} />
      <meta name="apple-mobile-web-app-title" content={title} />
      <meta name="theme-color" content={themeColor} />
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
    const id = window.setTimeout(() => {
      setDisplayLocation(location);
      setStage("fadeIn");
    }, UI_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [location, displayLocation]);

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
          <Route path="/typography" element={<DebugOnlyRoute><TypographyPage /></DebugOnlyRoute>} />
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
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
);

export default App;
