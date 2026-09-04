import React, { useEffect, useRef, useState } from "react";
import type { LottieRefCurrentProps } from "lottie-react";
import lockupAsset from "@/assets/WhoopWhoop_Daily_Lockup.svg.asset.json";
import lockupCreamAsset from "@/assets/WhoopWhoop_Daily_Lockup_Cream.svg.asset.json";
import animationAsset from "@/assets/whoop-daily-logo.json.asset.json";
import { useThemeMode } from "@/lib/nightMode";

// A failed chunk fetch (stale build, flaky network) must never blank the page:
// resolve to a no-op so the static lockup stays on screen.
const Lottie = React.lazy(() =>
  import("lottie-react")
    .then((m) => ({ default: m.default }))
    .catch(() => ({ default: (() => null) as unknown as typeof import("lottie-react").default })),
);

// Preload both the player chunk and the animation JSON as soon as this module is
// imported, so the swap from static to animated happens as early as possible.
const dataPromises = new Map<string, Promise<unknown>>();
const loadData = (url: string) => {
  let p = dataPromises.get(url);
  if (!p) {
    void import("lottie-react");
    p = fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    dataPromises.set(url, p);
  }
  return p;
};

/** Animation + static art for each wordmark variant. */
const VARIANTS = {
  daily: {
    animation: animationAsset.url,
    still: lockupAsset.url,
    stillCream: lockupCreamAsset.url,
    alt: "WHOOP! WHOOP! Daily",
  },
  classic: {
    animation: "/whoop-classic-logo.json",
    still: "/WhoopWhoop_Classic_Lockup.svg",
    stillCream: "/WhoopWhoop_Classic_Lockup_Cream.svg",
    alt: "WHOOP! WHOOP! Classic",
  },
} as const;

export type LockupVariant = keyof typeof VARIANTS;

/** Still art for a variant (both themes) — used by the shared entry gate. */
export const lockupStills = (variant: LockupVariant): readonly string[] => [
  VARIANTS[variant].still,
  VARIANTS[variant].stillCream,
];

loadData(VARIANTS.daily.animation).catch(() => {
  /* static fallback covers it */
});


const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The Lottie paints the wordmark in warm black (#231F20). In night mode that
// disappears against the dark surface, so swap just that colour for cream —
// brand red / blue / orange are left untouched.
const DARK_RGB = [0.137, 0.122, 0.125];
const CREAM_RGB = [0.9725, 0.9490, 0.9137];
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

const recolorToCream = (input: unknown): unknown => {
  const clone = JSON.parse(JSON.stringify(input));
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (key === "c" && value && typeof value === "object") {
        const k = (value as { k?: unknown }).k;
        if (
          Array.isArray(k) &&
          k.length >= 3 &&
          k.every((v) => typeof v === "number") &&
          DARK_RGB.every((v, i) => near(v, k[i] as number))
        ) {
          (value as { k: number[] }).k = [...CREAM_RGB, ...(k.slice(3) as number[])];
          continue;
        }
      }
      walk(value);
    }
  };
  walk(clone);
  return clone;
};


/**
 * The daily logo lockup. The static SVG is painted first and stays visible
 * until the Lottie has mounted and rendered its first frame, then the two
 * cross-fade in place — no gap, no layout shift, no flicker. If the JSON fetch
 * fails, the player fails, or the visitor prefers reduced motion, the static
 * lockup simply remains.
 */
const DailyLogoLockup: React.FC<{ style?: React.CSSProperties; variant?: LockupVariant }> = ({
  style,
  variant = "daily",
}) => {
  const [json, setJson] = useState<unknown | null>(null);
  const [ready, setReady] = useState(false);
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);
  const { theme } = useThemeMode();
  const art = VARIANTS[variant];
  const lockupSrc = theme === "night" ? art.stillCream : art.still;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let live = true;
    setJson(null);
    setReady(false);
    loadData(art.animation)
      .then((data) => {
        if (live) setJson(data);
      })
      .catch(() => {
        /* keep the static fallback */
      });
    return () => {
      live = false;
    };
  }, [art.animation]);

  const animationData = React.useMemo(
    () => (json && theme === "night" ? recolorToCream(json) : json),
    [json, theme],
  );

  const layer: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    transition: "opacity 200ms ease",
  };

  return (
    <div
      style={{ position: "relative", width: "100%", maxWidth: 251, aspectRatio: "251 / 211", ...style }}
    >
      <img
        src={lockupSrc}
        alt={art.alt}
        style={{ ...layer, objectFit: "contain", opacity: ready ? 0 : 1 }}
      />

      {animationData && (
        <React.Suspense fallback={null}>
          <div style={{ ...layer, opacity: ready ? 1 : 0 }}>
            <Lottie
              key={theme}
              lottieRef={lottieRef}
              animationData={animationData}

              loop={false}
              autoplay
              aria-hidden="true"
              onDOMLoaded={() => setReady(true)}
              rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </React.Suspense>
      )}
    </div>
  );
};

export default DailyLogoLockup;
