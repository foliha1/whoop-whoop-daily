import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-context";

import MultiplayerPage from "./pages/MultiplayerPage.tsx";
import DailyPage from "./pages/DailyPage.tsx";
import SupportPage from "./pages/SupportPage.tsx";
import AdminPage from "./pages/AdminPage.tsx";
import GroupsPage from "./pages/GroupsPage.tsx";
import TypographyPage from "./pages/TypographyPage.tsx";
import PrivacyPage from "./pages/PrivacyPage.tsx";
import TermsPage from "./pages/TermsPage.tsx";
import DebugOnlyRoute from "./components/DebugOnlyRoute.tsx";
import NotFound from "./pages/NotFound.tsx";
import ChasePreview from "./pages/ChasePreview.tsx";



const FADE_MS = 200;

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
    }, FADE_MS);
    return () => window.clearTimeout(id);
  }, [location, displayLocation]);

  return (
    <div
      className="page-transition"
      style={{
        opacity: stage === "fadeIn" ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
        minHeight: "var(--ww-vh)",
      }}
    >
      <Routes location={displayLocation}>
        <Route path="/" element={<DailyPage />} />
        <Route path="/today" element={<DailyPage />} />
        {/* HIDDEN: Groups is built but not launched. Debug-gated until the
            multiplayer push ships; re-enable by moving this back above with
            the open routes. */}
        <Route path="/groups" element={<DebugOnlyRoute><GroupsPage /></DebugOnlyRoute>} />
        <Route path="/about" element={<SupportPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/admin" element={<AdminPage />} />



        <Route path="/play" element={<MultiplayerPage />} />
        <Route path="/play/:roomCode" element={<MultiplayerPage />} />
        <Route path="/__chase" element={<ChasePreview />} />
        {/* Debug-gated routes: 404 in production, live under ?debug=1. */}
        <Route path="/typography" element={<DebugOnlyRoute><TypographyPage /></DebugOnlyRoute>} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
