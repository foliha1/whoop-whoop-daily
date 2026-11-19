import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("lottie-react");
  vi.resetModules();
});

describe("Lottie lazy loading", () => {
  it("accepts the production module shape", async () => {
    const component = () => null;
    vi.doMock("lottie-react", () => ({ default: component }));
    const { loadLottieComponent } = await import("@/lib/lottieLoader");

    await expect(loadLottieComponent()).resolves.toEqual({ default: component });
  });

  it("unwraps the preview CommonJS compatibility shape", async () => {
    const component = () => null;
    vi.doMock("lottie-react", () => ({ default: { default: component } }));
    const { loadLottieComponent } = await import("@/lib/lottieLoader");

    await expect(loadLottieComponent()).resolves.toEqual({ default: component });
  });

  it("returns a static fallback when the chunk cannot load", async () => {
    vi.doMock("lottie-react", () => {
      throw new Error("chunk unavailable");
    });
    const { loadLottieComponent } = await import("@/lib/lottieLoader");

    const loaded = await loadLottieComponent();
    expect(loaded.default).toBeTypeOf("function");
  });
});
