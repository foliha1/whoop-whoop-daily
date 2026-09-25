import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toClassicHtml } from "../../scripts/classicHead.mjs";

const root = resolve(import.meta.dirname, "../..");
const dailyHtml = readFileSync(resolve(root, "index.html"), "utf8");
const classicHtml = toClassicHtml(dailyHtml);

const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const pngDimensions = (path: string): [number, number] => {
  const png = readFileSync(resolve(root, path));
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe("product install metadata", () => {
  it("keeps Daily and Classic head links isolated", () => {
    expect(dailyHtml).toContain('href="/daily.webmanifest?v=20260925"');
    expect(dailyHtml).toContain('href="/icons/daily/apple-touch-icon.png?v=20260925"');
    expect(dailyHtml).toContain('name="apple-mobile-web-app-title" content="W! W! Daily"');
    expect(dailyHtml).not.toContain("/icons/classic/");
    expect(dailyHtml).not.toContain("/classic.webmanifest");

    expect(classicHtml).toContain('href="/classic.webmanifest?v=20260925"');
    expect(classicHtml).toContain('href="/icons/classic/apple-touch-icon.png?v=20260925"');
    expect(classicHtml).toContain('name="apple-mobile-web-app-title" content="W! W! Classic"');
    expect(classicHtml).not.toContain("/icons/daily/");
    expect(classicHtml).not.toContain("/daily.webmanifest");
  });

  it("defines each manifest with its own product identity", () => {
    expect(readJson("public/daily.webmanifest")).toMatchObject({
      name: "W! W! Daily",
      short_name: "Daily",
      start_url: "/",
      display: "standalone",
      theme_color: "#F8F2E9",
      background_color: "#F8F2E9",
    });
    expect(readJson("public/classic.webmanifest")).toMatchObject({
      name: "W! W! Classic",
      short_name: "Classic",
      start_url: "/classic.html",
      display: "standalone",
      theme_color: "#231F20",
      background_color: "#231F20",
    });
    for (const manifest of [readJson("public/daily.webmanifest"), readJson("public/classic.webmanifest")]) {
      for (const icon of manifest.icons) expect(icon.src).toContain("?v=20260925");
    }
  });

  it.each(["daily", "classic"])("has the complete %s PNG icon set", (product) => {
    expect(pngDimensions(`public/icons/${product}/apple-touch-icon.png`)).toEqual([180, 180]);
    expect(pngDimensions(`public/icons/${product}/icon-192.png`)).toEqual([192, 192]);
    expect(pngDimensions(`public/icons/${product}/icon-512.png`)).toEqual([512, 512]);
    expect(pngDimensions(`public/icons/${product}/icon-maskable-512.png`)).toEqual([512, 512]);
    expect(pngDimensions(`public/icons/${product}/favicon-32.png`)).toEqual([32, 32]);
    expect(pngDimensions(`public/icons/${product}/favicon-16.png`)).toEqual([16, 16]);
  });
});