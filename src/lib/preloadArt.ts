import { ALL_CARDS, CARD_BACK_PATH } from "@/cardData";
import { MATCH_ART_SRC } from "@/components/MatchDie";

const preloaded = new Map<string, Promise<void>>();

function preloadImage(src: string): Promise<void> {
  const existing = preloaded.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (typeof img.decode === "function") void img.decode().catch(() => undefined).then(() => resolve());
      else resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
  preloaded.set(src, promise);
  return promise;
}

const preload = (sources: readonly string[]) => Promise.all(sources.map(preloadImage)).then(() => undefined);

/** Small shared art needed by the first game transition. */
export function preloadEssentialGameArt(): Promise<void> {
  return preload([CARD_BACK_PATH, ...Object.values(MATCH_ART_SRC)]);
}

/** Today's fixed Daily board, decoded before its reveal begins. */
export function preloadDailyBoardArt(sources: readonly string[]): Promise<void> {
  return preload(sources);
}

/**
 * Preload every card face, the card back, and all die faces once per session.
 * Keeps the image elements alive so the browser cannot evict the decoded SVG
 * art; this prevents the first flip / die reveal from flickering.
 */
export function preloadGameArt(): void {
  void preload([
    CARD_BACK_PATH,
    ...Object.values(MATCH_ART_SRC),
    ...ALL_CARDS.map((c) => c.svgPath),
  ]);
}
