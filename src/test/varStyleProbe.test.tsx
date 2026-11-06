import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("jsdom var() style probe", () => {
  it("reports how var() inline colors survive", () => {
    const { container } = render(
      <div style={{ color: "var(--ww-ink)", background: "var(--ww-surface)" }}>x</div>,
    );
    const el = container.firstChild as HTMLElement;
    console.log("style.color =", JSON.stringify(el.style.color));
    console.log("style.background =", JSON.stringify(el.style.background));
    console.log("attr =", JSON.stringify(el.getAttribute("style")));
    expect(true).toBe(true);
  });
});
