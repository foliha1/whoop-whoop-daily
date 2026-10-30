import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { initTheme } from "./lib/nightMode";
import { initSkin } from "./lib/skin";
import "./lib/installPrompt";

// Resolve light/night before the first paint so there is never a flash.
initTheme();
// Stamp the Spook Spook palette flag before first paint for the same reason.
initSkin();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
