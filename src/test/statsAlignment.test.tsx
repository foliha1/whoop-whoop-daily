// Your Stats content must sit under the top pattern rail in the new lobby
// preview instead of floating mid-page, and must stay centred in today's app.
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import DailyFrame from "@/components/DailyFrame";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

afterEach(() => cleanup());

const frameFor = (props: { align?: "center" | "top" } = {}) => {
  const { container } = render(<DailyFrame {...props}>Stats content</DailyFrame>);
  return container.firstElementChild as HTMLElement;
};

describe("Your Stats vertical alignment", () => {
  it("pins the content column under the top rail when align is top", () => {
    const el = frameFor({ align: "top" });
    expect(el.style.justifyContent).toBe("flex-start");
    const rails = el.querySelectorAll<HTMLElement>(".daily-shape-rule");
    expect(rails).toHaveLength(2);
    expect(rails[0].style.marginTop).toBe("");
    expect(rails[1].style.marginTop).toBe("auto");
  });

  it("keeps every other daily screen centred by default", () => {
    const el = frameFor();
    expect(el.style.justifyContent).toBe("space-between");
    const rails = el.querySelectorAll<HTMLElement>(".daily-shape-rule");
    expect(rails[1].style.marginTop).toBe("");
  });

  it("gates the top alignment on Your Stats behind the launch switch", () => {
    expect(src("src/pages/YouPage.tsx")).toContain('align={umbrella ? "top" : "center"}');
    // Only two screens sit at the top of the frame: Your Stats (switch-gated) and
    // About, an editorial page that is top-aligned in both launch states. The
    // live app's ready/play/result pages stay centred.
    const optedIn = readdirSync(resolve(process.cwd(), "src/pages"), { recursive: true })
      .filter((f) => typeof f === "string" && f.endsWith(".tsx"))
      .filter((f) => src(`src/pages/${f}`).includes('align="top"') || src(`src/pages/${f}`).includes("align={umbrella"));
    expect(optedIn).toEqual(["SupportPage.tsx", "YouPage.tsx"]);
  });
});
