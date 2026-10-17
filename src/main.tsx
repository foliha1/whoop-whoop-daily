import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { initTheme } from "./lib/nightMode";
import "./lib/installPrompt";

// Resolve light/night before the first paint so there is never a flash.
initTheme();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
