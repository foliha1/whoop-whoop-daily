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
  // The admin-preview plumbing is bypassed entirely once LAUNCHED is true.
  const itOff = LAUNCHED ? it.skip : it;
  itOff("a caller during the check waits for it and sees the result", async () => {
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

  it("a caller after the check has settled reads the settled state", async () => {
    const first = initUmbrellaPreview();
    pending.resolveUser({ data: { user: { id: "u1" } } });
    await first;
    expect(umbrellaOn()).toBe(true);
    // A later call returns immediately; the settled result holds.
    await initUmbrellaPreview();
    expect(umbrellaOn()).toBe(true);
  });
});
