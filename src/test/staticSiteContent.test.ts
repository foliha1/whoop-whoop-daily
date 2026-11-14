import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FAQ_ITEMS, FAQ_JSON_LD } from "../content/faq.mjs";
import { toClassicHtml } from "../../scripts/classicHead.mjs";
import { toDailyHtml, toHomeHtml } from "../../scripts/umbrellaHead.mjs";

const template = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const builtDocuments = {
  "index.html": toHomeHtml(template),
  "daily.html": toDailyHtml(toHomeHtml(template)),
  "classic.html": toClassicHtml(toDailyHtml(toHomeHtml(template))),
};

describe("build-time readable site content", () => {
  it.each(Object.entries(builtDocuments))("%s contains the shared FAQ and plain site links", (_name, html) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const root = document.querySelector("#root");
    expect(root?.querySelector("#ww-static-content h1")?.textContent).toBe("WHOOP! WHOOP!");

    for (const item of FAQ_ITEMS) {
      expect(root?.textContent).toContain(item.q);
      expect(root?.textContent).toContain(item.a);
      for (const entry of item.list ?? []) expect(root?.textContent).toContain(entry);
    }
    for (const path of ["/", "/daily", "/rules", "/faq", "/about"]) {
      expect(root?.querySelector(`a[href="${path}"]`)).not.toBeNull();
    }
  });

  it.each(Object.entries(builtDocuments))("%s contains static FAQ structured data from the same source", (_name, html) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const script = document.querySelector("head script#ww-faq-jsonld");
    expect(JSON.parse(script?.textContent ?? "null")).toEqual(FAQ_JSON_LD);
  });

  it("leaves About indexable", () => {
    expect(readFileSync(resolve(process.cwd(), "src/pages/SupportPage.tsx"), "utf8")).not.toContain("noindex, nofollow");
  });
});
