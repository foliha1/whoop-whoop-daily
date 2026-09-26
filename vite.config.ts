import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
// @ts-expect-error - plain ESM build script, no types needed
import { classicPrerender } from "./scripts/classicHead.mjs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // Never inline assets: every font, card, die, badge and sound keeps its own
  // hashed /assets/ URL with year-long immutable caching.
  build: { assetsInlineLimit: 0 },
  plugins: [react(), mode === "development" && componentTagger(), mcpPlugin(), classicPrerender()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
