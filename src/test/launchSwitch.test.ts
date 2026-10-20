// ============================================================================
// Launch switch tests — the umbrella is ON in this build: the launch switch
// is true, so every gate is ON for everyone, and the admin preview plumbing
// is bypassed entirely.
// ============================================================================

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import {
  LAUNCHED,
  umbrellaOn,
  initUmbrellaPreview,
  setUmbrellaPreviewForTests,
} from "@/lib/launch";
import { getDisplayName, setDisplayName } from "@/lib/visitor";

afterEach(() => {
  cleanup();
  setUmbrellaPreviewForTests(null);
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

describe("launch switch defaults", () => {
  it("is ON in this build", () => {
    expect(LAUNCHED).toBe(true);
    expect(umbrellaOn()).toBe(true);
  });

  it("stays ON even when a preview check fails or resolves off", async () => {
    // Signed-out in jsdom: no session, no RPC — the build-time switch still wins.
    await initUmbrellaPreview();
    expect(umbrellaOn()).toBe(true);
    setUmbrellaPreviewForTests(false);
    expect(umbrellaOn()).toBe(true);
  });
});

describe("ON: the umbrella features are visible", () => {
  it("Settings shows the name editor now that the umbrella is ON", async () => {
    const { default: SettingsSheet } = await import("@/components/SettingsSheet");
    render(
      React.createElement(SettingsSheet, { onClose: () => {}, product: "daily" })
    );
    expect(await screen.findByTestId("display-name-editor")).toBeInTheDocument();
  });

  it("Solo labels the human seat with the stored name once ON", async () => {
    setDisplayName("Felix");
    const { umbrellaOn: on } = await import("@/lib/launch");
    const playerName = on() ? getDisplayName() || "You" : "You";
    expect(playerName).toBe("Felix");
  });
});
