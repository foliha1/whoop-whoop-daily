import { FAQ_ITEMS, FAQ_JSON_LD } from "../src/content/faq.mjs";

const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const faqHtml = FAQ_ITEMS.map((item) => `
      <article>
        <h3>${escapeHtml(item.q)}</h3>
        <p>${escapeHtml(item.a)}</p>
        ${item.list ? `<ul>${item.list.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>` : ""}
      </article>`).join("");

/** Readable without JavaScript; React replaces this block when the app mounts. */
const STATIC_CONTENT = `<main id="ww-static-content" style="box-sizing:border-box;max-width:760px;min-height:100vh;margin:0 auto;padding:40px 24px;background:#F8F2E9;color:#231F20;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6">
    <h1>WHOOP! WHOOP!</h1>
    <p>WHOOP! WHOOP! is a free online memory card game where a die changes whether cards match by shape, number, or color.</p>
    <section>
      <h2>Three ways to play</h2>
      <ul>
        <li><strong>Daily:</strong> a new puzzle every day at <a href="/daily" style="color:inherit">whoop-whoop.com/daily</a>.</li>
        <li><strong>Solo:</strong> play against the built-in computer opponent FELIX.</li>
        <li><strong>Together:</strong> live multiplayer for up to 6 players at a private table, joined with a table code.</li>
      </ul>
    </section>
    <section>
      <h2>How to play</h2>
      <p>Roll the Match Die to set the rule: shape, number or color. On your turn, flip two cards. Anyone can shout WHOOP! WHOOP! at any time and touch two cards that match. A correct claim takes the pair. First to 12 cards wins. The Daily is a separate three-round memory puzzle.</p>
    </section>
    <section>
      <h2>Frequently asked questions</h2>${faqHtml}
    </section>
    <section>
      <h2>About</h2>
      <p>WHOOP! WHOOP! is made by Felix Oliha.</p>
      <p>It is published by Oleeha &amp; Co.</p>
    </section>
    <nav aria-label="Site pages">
      <a href="/" style="color:inherit">Home</a> |
      <a href="/daily" style="color:inherit">Daily</a> |
      <a href="/rules" style="color:inherit">Rules</a> |
      <a href="/faq" style="color:inherit">FAQ</a> |
      <a href="/about" style="color:inherit">About</a>
    </nav>
  </main>`;

const FAQ_SCRIPT = `<script id="ww-faq-jsonld" type="application/ld+json">${JSON.stringify(FAQ_JSON_LD).replace(/</g, "\\u003c")}</script>`;

/** Add crawler-readable content and FAQ structured data exactly once. */
export function withStaticContent(html) {
  let output = html;
  if (!output.includes('id="ww-static-content"')) {
    output = output.replace('<div id="root"></div>', `<div id="root">${STATIC_CONTENT}</div>`);
  }
  if (!output.includes('id="ww-faq-jsonld"')) {
    output = output.replace("</head>", `    ${FAQ_SCRIPT}\n</head>`);
  }
  return output;
}
