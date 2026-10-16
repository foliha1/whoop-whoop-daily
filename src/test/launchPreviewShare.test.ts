// ============================================================================
// Regression: a caller that arrives while the admin-preview check is still
// running must share the in-flight promise. Previously the second caller
// (e.g. AnimatedRoutes' useUmbrella) resolved immediately with OFF because
// `checked` was already true, and never re-rendered when the check later
// returned true — the first caller was ProductInstallHead, which only renders
// head tags, so the page stayed on the OFF version.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pending: { resolveUser: (v: unknown) => void } = { resolveUser: () => {} };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: () =>
        new Promise((resolve) => {
          pending.resolveUser = resolve;
        }),
      onAuthStateChange: undefined,
    },
    rpc: async () => ({ data: true, error: null }),
  },
}));

import { initUmbrellaPreview, umbrellaOn, setUmbrellaPreviewForTests } from "@/lib/launch";

beforeEach(() => {
  setUmbrellaPreviewForTests(null);
});

afterEach(() => {
  setUmbrellaPreviewForTests(null);
  pending.resolveUser({ data: { user: null } });
});

describe("initUmbrellaPreview shares the in-flight check", () => {
  it("a caller during the check waits for it and sees the result", async () => {
    const first = initUmbrellaPreview();
    let secondDone = false;
    const second = initUmbrellaPreview().then(() => {
      secondDone = true;
    });

    // Let microtasks drain while the fake getUser is still pending.
    await Promise.resolve();
    await Promise.resolve();
    expect(secondDone).toBe(false);

    pending.resolveUser({ data: { user: { id: "u1" } } });
    await Promise.all([first, second]);
    expect(umbrellaOn()).toBe(true);
  });

  it("a caller after the check resolves reads the settled state", async () => {
    await initUmbrellaPreview();
    pending.resolveUser({ data: { user: { id: "u1" } } });
    // The first check already settled with no user; a new check runs.
    await initUmbrellaPreview();
    expect(umbrellaOn()).toBe(true);
  });
});
