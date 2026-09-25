// ============================================================================
// classicHead — build-time head rewriting for the Classic route.
//
// Scrapers (Facebook, iMessage, WhatsApp, Slack, Twitter) do not run JS, so
// react-helmet-async can never give an invite link its own preview. Instead we
// emit an extra STATIC document at build time, derived from the Daily
// index.html with the Classic tags swapped in. The Daily's dist/index.html is
// copied, never mutated.
//
// IMPORTANT hosting note: the previous attempt emitted dist/play/index.html.
// Lovable hosting's SPA fallback answers extensionless navigations with the
// root index.html BEFORE resolving a directory index, so that document was
// never served. A path that ends in `.html` looks like a file to the host and
// is served directly, so the Classic document lives at dist/classic.html and
// invite links point at /classic.html?r=CODE. A copy is still emitted at
// dist/classic/index.html in case directory-index resolution is available.
// ============================================================================

const ORIGIN = "https://whoop-whoop.com";
const INSTALL_ASSET_VERSION = "20260925";
const versioned = (path) => `${path}?v=${INSTALL_ASSET_VERSION}`;

/** The URL that actually serves the Classic document (real file, not fallback). */
export const CLASSIC_DOC_PATH = "/classic.html";

export const CLASSIC_META = {
  url: `${ORIGIN}${CLASSIC_DOC_PATH}`,
  title: "WHOOP! WHOOP! Classic — Live Multiplayer Memory Game",
  description:
    "Live memory match for 2–6 players. Flip cards, spot the pair, shout WHOOP! WHOOP! first. Join the table—no signup.",
  image: `${ORIGIN}/og-classic.png`,
  imageAlt: "WHOOP! WHOOP! Classic — live multiplayer memory game for 2 to 6 players",
};

const DAILY_PRODUCT_HEAD = {
  themeColor: "#F8F2E9",
  manifest: versioned("/daily.webmanifest"),
  appleTouchIcon: versioned("/icons/daily/apple-touch-icon.png"),
  favicon32: versioned("/icons/daily/favicon-32.png"),
  favicon16: versioned("/icons/daily/favicon-16.png"),
  appleTitle: "WHOOP! WHOOP! Daily",
};

const CLASSIC_PRODUCT_HEAD = {
  themeColor: "#231F20",
  manifest: versioned("/classic.webmanifest"),
  appleTouchIcon: versioned("/icons/classic/apple-touch-icon.png"),
  favicon32: versioned("/icons/classic/favicon-32.png"),
  favicon16: versioned("/icons/classic/favicon-16.png"),
  appleTitle: "WHOOP! WHOOP! Classic",
};

/** Replace the content of a `<meta>` tag matched on name/property. */
function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "i");
  if (!re.test(html)) return html;
  return html.replace(re, `$1${value}$2`);
}

/** Derive the Classic document from the built Daily index.html. */
export function toClassicHtml(dailyHtml) {
  let html = dailyHtml;
  const m = CLASSIC_META;

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${m.title}</title>`);
  html = setMeta(html, "name", "description", m.description);
  html = setMeta(html, "property", "og:url", m.url);
  html = setMeta(html, "property", "og:title", m.title);
  html = setMeta(html, "property", "og:description", m.description);
  html = setMeta(html, "property", "og:image", m.image);
  html = setMeta(html, "property", "og:image:alt", m.imageAlt);
  html = setMeta(html, "name", "twitter:title", m.title);
  html = setMeta(html, "name", "twitter:description", m.description);
  html = setMeta(html, "name", "twitter:image", m.image);

  // Product-install identity only. Keep all existing Classic social metadata
  // transformations above untouched while swapping Daily's install tags.
  html = setMeta(html, "name", "theme-color", CLASSIC_PRODUCT_HEAD.themeColor);
  html = setMeta(
    html,
    "name",
    "apple-mobile-web-app-title",
    CLASSIC_PRODUCT_HEAD.appleTitle,
  );
  html = html
    .replace(DAILY_PRODUCT_HEAD.manifest, CLASSIC_PRODUCT_HEAD.manifest)
    .replace(DAILY_PRODUCT_HEAD.appleTouchIcon, CLASSIC_PRODUCT_HEAD.appleTouchIcon)
    .replace(DAILY_PRODUCT_HEAD.favicon32, CLASSIC_PRODUCT_HEAD.favicon32)
    .replace(DAILY_PRODUCT_HEAD.favicon16, CLASSIC_PRODUCT_HEAD.favicon16);

  // Canonical points at itself; Classic stays out of search via robots.
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/i,
    `<link rel="canonical" href="${m.url}" />\n    <meta name="robots" content="noindex, nofollow" />`,
  );

  return html;
}

/** Vite plugin: emit the Classic document alongside the SPA shell. */
export function classicPrerender() {
  return {
    name: "ww-classic-prerender",
    enforce: "post",
    transformIndexHtml(html, context) {
      const path = context.originalUrl?.split("?", 1)[0];
      const classicRequest =
        path === "/classic" ||
        path === "/classic.html" ||
        path?.startsWith("/classic/") ||
        path === "/play" ||
        path?.startsWith("/play/");
      return classicRequest ? toClassicHtml(html) : html;
    },
    generateBundle(_options, bundle) {
      const shell = bundle["index.html"];
      if (!shell || typeof shell.source !== "string") return;
      const source = toClassicHtml(shell.source);
      // Primary: a real .html file the host serves without directory-index
      // resolution and without the SPA fallback intercepting it.
      this.emitFile({ type: "asset", fileName: "classic.html", source });
      // Secondary: reachable when the host resolves directory indexes for
      // extensionless paths (it does today for /play).
      this.emitFile({ type: "asset", fileName: "classic/index.html", source });
      // Legacy /play links keep their Classic preview; the SPA redirects them
      // to /classic on load.
      this.emitFile({ type: "asset", fileName: "play/index.html", source });
    },
  };
}
