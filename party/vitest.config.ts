import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: [
      { find: "@/lib/assetUrls", replacement: path.resolve(__dirname, "src/assetUrlsStub.ts") },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "../src/$1") },
    ],
  },
});
