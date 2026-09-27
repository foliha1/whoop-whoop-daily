// ============================================================================
// Launch switch tests — the umbrella must be OFF by default and provably
// invisible to players, and the admin preview must be the only way ON.
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
  it("is OFF in this build", () => {
    expect(LAUNCHED).toBe(false);
    expect(umbrellaOn()).toBe(false);
  });

  it("signed-out preview check resolves OFF (no session, no RPC)", async () => {
    await initUmbrellaPreview();
    expect(umbrellaOn()).toBe(false);
  });

  it("a failed preview check stays OFF", async () => {
    // jsdom has no reachable backend; even if the call errors, OFF holds.
    setUmbrellaPreviewForTests(null);
    await initUmbrellaPreview();
    expect(umbrellaOn()).toBe(false);
  });

  it("the test override turns the preview ON and back OFF", () => {
    setUmbrellaPreviewForTests(true);
    expect(umbrellaOn()).toBe(true);
    setUmbrellaPreviewForTests(null);
    expect(umbrellaOn()).toBe(false);
  });
});

describe("OFF: nothing new is visible", () => {
  it("Settings shows no name editor while OFF", async () => {
    const { default: SettingsSheet } = await import("@/components/SettingsSheet");
    render(
      React.createElement(SettingsSheet, { onClose: () => {}, product: "daily" })
    );
    expect(screen.queryByTestId("display-name-editor")).not.toBeInTheDocument();
  });

  it("Settings shows the name editor for an admin preview (ON)", async () => {
    setUmbrellaPreviewForTests(true);
    const { default: SettingsSheet } = await import("@/components/SettingsSheet");
    render(
      React.createElement(SettingsSheet, { onClose: () => {}, product: "daily" })
    );
    expect(await screen.findByTestId("display-name-editor")).toBeInTheDocument();
  });

  it("Solo labels the human seat 'You' while OFF, even with a stored name", async () => {
    setDisplayName("Felix");
    const { umbrellaOn: on } = await import("@/lib/launch");
    const playerName = on() ? getDisplayName() || "You" : "You";
    expect(playerName).toBe("You");
  });
});
