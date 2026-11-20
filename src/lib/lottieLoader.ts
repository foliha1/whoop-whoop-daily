import type LottieReact from "lottie-react";

type LottieComponent = typeof LottieReact;

const StaticFallback = (() => null) as unknown as LottieComponent;

/**
 * Production ESM exposes the component at module.default. The preview's
 * CommonJS compatibility layer can instead expose module.default.default.
 * Accept both so React.lazy always receives a component, never a module object.
 */
export const resolveLottieComponent = (loaded: unknown): LottieComponent | null => {
  if (!loaded || (typeof loaded !== "object" && typeof loaded !== "function") || !("default" in loaded)) {
    return null;
  }

  let component = (loaded as { default: unknown }).default;
  if (component && typeof component === "object" && "default" in component) {
    component = (component as { default: unknown }).default;
  }

  return component ? (component as LottieComponent) : null;
};

/** A failed or incompatible chunk leaves the caller's static artwork intact. */
export const loadLottieComponent = async (): Promise<{ default: LottieComponent }> => {
  try {
    const loaded = await import("lottie-react");
    return { default: resolveLottieComponent(loaded) ?? StaticFallback };
  } catch {
    return { default: StaticFallback };
  }
};

/**
 * True when an animation uses something the light lottie player can't draw:
 * expressions (a string "x" on a property) or layer effects ("ef").
 * Callers keep their static artwork for such files instead of a broken draw.
 */
export const needsFullLottie = (data: unknown): boolean => {
  const stack: unknown[] = [data];
  while (stack.length) {
    const o = stack.pop();
    if (Array.isArray(o)) {
      for (const v of o) if (v && typeof v === "object") stack.push(v);
    } else if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      if (typeof rec.x === "string") return true;
      if (Array.isArray(rec.ef) && rec.ef.length > 0) return true;
      for (const v of Object.values(rec)) if (v && typeof v === "object") stack.push(v);
    }
  }
  return false;
};
