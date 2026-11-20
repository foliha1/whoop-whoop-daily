import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
// @ts-expect-error - plain ESM build script, no types needed
import { classicPrerender } from "./scripts/classicHead.mjs";
// @ts-expect-error - plain ESM build script, no types needed
import { umbrellaHead } from "./scripts/umbrellaHead.mjs";

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
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Libraries change far less often than our code. Giving them their own
        // files means a deploy only invalidates the app chunks, so returning
        // players keep the cached libraries instead of re-downloading them.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          // tslib is shared with the UI libraries. Left to Rollup it lands in
          // the Supabase chunk and drags that chunk onto the first-paint path.
          if (/node_modules\/tslib\//.test(id)) return "vendor-react";
          if (/node_modules\/(@supabase|iceberg-js)\//.test(id)) return "vendor-supabase";
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) return "vendor-react";
          return undefined;
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), mcpPlugin(), umbrellaHead(), classicPrerender()].filter(Boolean),
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // lottie-react imports the full lottie-web player (~77 KB gzip). Our
      // animations use the SVG renderer with no expressions or effects, so
      // the light SVG-only build (~47 KB gzip) draws them identically.
      // DailyLogoLockup checks each file and keeps the still art if one ever
      // needs a feature the light build lacks.
      { find: /^lottie-web$/, replacement: path.resolve(__dirname, "node_modules/lottie-web/build/player/lottie_light.js") },
    ],
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
