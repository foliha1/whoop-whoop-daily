import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppButton } from "@/components/ui/AppButton";
import { BUTTON_PALETTE, RAW, buttonStyle } from "@/lib/tokens";

const THEMES = {
  light: { surface: "#F8F2E9", surfaceHover: "#e8e0d4", panel: "#D0C3AF", ink: "#231f20", inkMuted: "#544c4a" },
  night: { surface: "#231F20", surfaceHover: "#2E2829", panel: "#3A3335", ink: "#F8F2E9", inkMuted: "#BAB0A9" },
} as const;

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  if (!channels) throw new Error(`Invalid color ${hex}`);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("canonical button palette", () => {
  it.each([
    ["Primary", RAW.cream, RAW.red],
    ["Primary pressed", RAW.cream, RAW.redHover],
    ["Secondary", RAW.cream, RAW.blue],
    ["Secondary pressed", RAW.cream, RAW.blueHover],
    ["Accent", RAW.warmBlack, RAW.orange],
    ["Accent pressed", RAW.warmBlack, RAW.orangeHover],
  ])("keeps %s at or above 4.5:1", (_name, foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(THEMES))("keeps theme roles accessible in %s", (_theme, colors) => {
    const pairs = [
      [colors.surface, colors.ink],
      [colors.surface, colors.inkMuted],
      [colors.ink, colors.surface],
      [colors.ink, colors.surfaceHover],
      [colors.inkMuted, colors.panel],
    ];
    pairs.forEach(([foreground, background]) => expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5));
  });

  it("uses fixed foregrounds for every fixed brand fill", () => {
    expect(BUTTON_PALETTE.primary.fg).toBe(RAW.cream);
    expect(BUTTON_PALETTE.secondary.fg).toBe(RAW.cream);
    expect(BUTTON_PALETTE.accent.fg).toBe(RAW.warmBlack);
    expect(BUTTON_PALETTE.dangerConfirm.fg).toBe(RAW.cream);
  });

  it("uses real disabled colors without opacity", () => {
    const disabled = buttonStyle("primary", "md", { disabled: true });
    expect(disabled.background).toBe("var(--ww-panel)");
    expect(disabled.color).toBe("var(--ww-ink-muted)");
    expect(disabled.opacity).toBe(1);
  });

  it("makes AppButton consume the same canonical palette", () => {
    render(<AppButton roleStyle="primary">Continue</AppButton>);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveStyle({
      background: BUTTON_PALETTE.primary.bg,
      color: BUTTON_PALETTE.primary.fg,
    });
  });

  it("keeps loading role colors while interaction is disabled", () => {
    render(<AppButton roleStyle="secondary" disabled>Sending…</AppButton>);
    const button = screen.getByRole("button", { name: "Sending…" });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ opacity: "1" });
  });
});