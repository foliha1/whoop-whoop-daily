// ============================================================================
// classicHead — build-time head rewriting for the Classic (/play) routes.
//
// Scrapers (Facebook, iMessage, WhatsApp, Slack, Twitter) do not run JS, so
// react-helmet-async can never give an invite link its own preview. Instead we
// emit an extra STATIC document at dist/play/index.html at build time, derived
// from the Daily index.html with the Classic tags swapped in. The Daily's
// dist/index.html is copied, never mutated.
// ============================================================================

const ORIGIN = "https://whoop-whoop.com";

export const CLASSIC_META = {
  url: `${ORIGIN}/play`,
  title: "WHOOP! WHOOP! Classic — Live Multiplayer Memory Game",
  description:
    "Live memory match for 2–6 players. Flip cards, spot the pair, shout WHOOP! WHOOP! first. Join the table—no signup.",
  image: `${ORIGIN}/og-classic.png`,
  imageAlt: "WHOOP! WHOOP! Classic — live multiplayer memory game for 2 to 6 players",
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

  // Canonical points at itself; Classic stays out of search via robots.
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/i,
    `<link rel="canonical" href="${m.url}" />\n    <meta name="robots" content="noindex, nofollow" />`,
  );

  return html;
}

/** Vite plugin: emit dist/play/index.html alongside the SPA shell. */
export function classicPrerender() {
  return {
    name: "ww-classic-prerender",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const shell = bundle["index.html"];
      if (!shell || typeof shell.source !== "string") return;
      this.emitFile({
        type: "asset",
        fileName: "play/index.html",
        source: toClassicHtml(shell.source),
      });
    },
  };
}
