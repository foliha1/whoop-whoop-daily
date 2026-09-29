import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = "https://whoop-whoop.com";
const CONFIG = readFileSync(resolve(process.cwd(), "src/launch.config.ts"), "utf8");
export const UMBRELLA_LAUNCHED = /LAUNCH_CONFIG\s*=\s*\{\s*launched:\s*true\s*\}/.test(CONFIG);

export const HOME_META = {
  title: "WHOOP! WHOOP!",
  description: "The memory game where the rules keep changing. Play the Daily, go Solo, or play Together.",
  installName: "Whoop Whoop",
  url: `${ORIGIN}/`,
  image: `${ORIGIN}/og-home.png`,
};

function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "i");
  return re.test(html) ? html.replace(re, `$1${value}$2`) : html;
}

function setLink(html, rel, value) {
  return html.replace(new RegExp(`(<link\\s+rel="${rel}"\\s+href=")[^"]*(")`, "i"), `$1${value}$2`);
}

export function toHomeHtml(dailyHtml) {
  let html = dailyHtml.replace(/<title>[^<]*<\/title>/i, `<title>${HOME_META.title}</title>`);
  html = setMeta(html, "name", "description", HOME_META.description);
  html = setMeta(html, "property", "og:url", HOME_META.url);
  html = setMeta(html, "property", "og:title", HOME_META.title);
  html = setMeta(html, "property", "og:description", HOME_META.description);
  html = setMeta(html, "property", "og:image", HOME_META.image);
  html = setMeta(html, "property", "og:image:alt", HOME_META.title);
  html = setMeta(html, "name", "twitter:title", HOME_META.title);
  html = setMeta(html, "name", "twitter:description", HOME_META.description);
  html = setMeta(html, "name", "twitter:image", HOME_META.image);
  html = setMeta(html, "name", "apple-mobile-web-app-title", HOME_META.installName);
  html = setLink(html, "canonical", HOME_META.url);
  return html
    .replace("/daily.webmanifest?v=20260925", "/home.webmanifest?v=20260929")
    .replace("/icons/daily/apple-touch-icon.png?v=20260925", "/icons/home/apple-touch-icon.png?v=20260929")
    .replace("/icons/daily/favicon-32.png?v=20260925", "/icons/home/favicon-32.png?v=20260929")
    .replace("/icons/daily/favicon-16.png?v=20260925", "/icons/home/favicon-16.png?v=20260929");
}

export function toDailyHtml(homeHtml) {
  let html = homeHtml.replace(/<title>[^<]*<\/title>/i, "<title>WHOOP! WHOOP! — Daily Memory Game</title>");
  const description = "Play the free WHOOP! WHOOP! daily memory game. Nine cards, ten seconds, three rounds, two misses a round. A new memory challenge every day—no signup needed.";
  html = setMeta(html, "name", "description", description);
  html = setMeta(html, "property", "og:url", `${ORIGIN}/daily`);
  html = setMeta(html, "property", "og:title", "WHOOP! WHOOP! — Daily Memory Game");
  html = setMeta(html, "property", "og:description", description);
  html = setMeta(html, "property", "og:image", `${ORIGIN}/og-daily.png`);
  html = setMeta(html, "property", "og:image:alt", "WHOOP! WHOOP! — Daily Memory Game");
  html = setMeta(html, "name", "twitter:title", "WHOOP! WHOOP! — Daily Memory Game");
  html = setMeta(html, "name", "twitter:description", description);
  html = setMeta(html, "name", "twitter:image", `${ORIGIN}/og-daily.png`);
  html = setMeta(html, "name", "apple-mobile-web-app-title", "WHOOP! WHOOP! Daily");
  html = setLink(html, "canonical", `${ORIGIN}/daily`);
  return html
    .replace("/home.webmanifest?v=20260929", "/daily.webmanifest?v=20260927")
    .replace("/icons/home/apple-touch-icon.png?v=20260929", "/icons/daily/apple-touch-icon.png?v=20260925")
    .replace("/icons/home/favicon-32.png?v=20260929", "/icons/daily/favicon-32.png?v=20260925")
    .replace("/icons/home/favicon-16.png?v=20260929", "/icons/daily/favicon-16.png?v=20260925");
}

export function umbrellaHead() {
  let dailyShell = "";
  return {
    name: "ww-umbrella-head",
    enforce: "pre",
    transformIndexHtml(html, context) {
      if (!UMBRELLA_LAUNCHED) return html;
      dailyShell = html;
      const path = context.originalUrl?.split("?", 1)[0];
      return path === "/daily" || path === "/daily.html" ? toDailyHtml(toHomeHtml(html)) : toHomeHtml(html);
    },
    closeBundle() {
      const manifestPath = resolve(process.cwd(), "dist/daily.webmanifest");
      try {
        const manifest = readFileSync(manifestPath, "utf8").replace(
          '__DAILY_START_URL__',
          UMBRELLA_LAUNCHED ? '/daily' : '/',
        );
        writeFileSync(manifestPath, manifest);
        if (UMBRELLA_LAUNCHED) {
          const builtHome = readFileSync(resolve(process.cwd(), "dist/index.html"), "utf8");
          const daily = toDailyHtml(builtHome);
          writeFileSync(resolve(process.cwd(), "dist/daily.html"), daily);
          mkdirSync(resolve(process.cwd(), "dist/daily"), { recursive: true });
          writeFileSync(resolve(process.cwd(), "dist/daily/index.html"), daily);
          const sitemapPath = resolve(process.cwd(), "dist/sitemap.xml");
          const sitemap = readFileSync(sitemapPath, "utf8");
          if (!sitemap.includes(`${ORIGIN}/daily<`)) {
            writeFileSync(sitemapPath, sitemap.replace(
              `<loc>${ORIGIN}/</loc>`,
              `<loc>${ORIGIN}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>${ORIGIN}/daily</loc>`,
            ));
          }
        }
      } catch {
        return undefined;
      }
    },
  };
}