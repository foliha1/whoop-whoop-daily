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

const INSTALL_ASSET_VERSION = "20260925";

import DebugOnlyRoute from "./components/DebugOnlyRoute.tsx";

const MultiplayerPage = lazy(() => import("./pages/MultiplayerPage.tsx"));
const DailyPage = lazy(() => import("./pages/DailyPage.tsx"));
const SupportPage = lazy(() => import("./pages/SupportPage.tsx"));
const AdminPage = lazy(() => import("./pages/AdminPage.tsx"));
const GroupsPage = lazy(() => import("./pages/GroupsPage.tsx"));
const YouPage = lazy(() => import("./pages/YouPage.tsx"));
const TypographyPage = lazy(() => import("./pages/TypographyPage.tsx"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage.tsx"));
const TermsPage = lazy(() => import("./pages/TermsPage.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));



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
  const classic = pathname === "/classic.html" || pathname === "/classic" || pathname.startsWith("/classic/");
  const product = classic ? "classic" : "daily";
  const title = classic ? "WHOOP! WHOOP! Classic" : "WHOOP! WHOOP! Daily";
  const themeColor = classic ? "#231F20" : "#F8F2E9";

  return (
    <Helmet>
      <link rel="icon" href={`/icons/${product}/favicon-32.png?v=${INSTALL_ASSET_VERSION}`} sizes="32x32" type="image/png" />
      <link rel="icon" href={`/icons/${product}/favicon-16.png?v=${INSTALL_ASSET_VERSION}`} sizes="16x16" type="image/png" />
      <link rel="apple-touch-icon" href={`/icons/${product}/apple-touch-icon.png?v=${INSTALL_ASSET_VERSION}`} sizes="180x180" />
      <link rel="manifest" href={`/${product}.webmanifest?v=${INSTALL_ASSET_VERSION}`} />
      <meta name="apple-mobile-web-app-title" content={title} />
      <meta name="theme-color" content={themeColor} />
    </Helmet>
  );
};

const AnimatedRoutes: React.FC = () => {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [stage, setStage] = useState<"fadeIn" | "fadeOut">("fadeIn");

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
      <Suspense
        fallback={(
          <div
            aria-hidden="true"
            style={{ minHeight: "var(--ww-vh)", background: COLORS.surface }}
          />
        )}
      >
        <Routes location={displayLocation}>
          <Route path="/" element={<DailyPage />} />
          <Route path="/today" element={<DailyPage />} />
          {/* Groups remains available for testing under ?debug=1 only. */}
          <Route path="/groups" element={<DebugOnlyRoute><Suspense fallback={<CardFlipLoader label="Loading Groups" layout="page" />}><GroupsPage /></Suspense></DebugOnlyRoute>} />
          {/* The player's long-term self. Not indexed, same as groups. */}
          <Route path="/you" element={<Suspense fallback={<CardFlipLoader label="Loading Your Stats" layout="page" />}><YouPage /></Suspense>} />
          <Route path="/about" element={<SupportPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
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
      </Suspense>
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
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
);

export default App;
