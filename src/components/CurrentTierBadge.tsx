import React from "react";
import type { PointsTier } from "@/lib/whoopPoints";
import { badgeArt, tierName } from "@/lib/whoopTiers";

type CurrentTierBadgeProps = {
  tier: PointsTier;
  size: number;
  testId?: string;
};

/**
 * Fixed brand art for the player's current tier. The asset is decoded before
 * the visible image mounts, so a missing or slow image never leaves a broken
 * image or an empty layout slot behind.
 */
const CurrentTierBadge: React.FC<CurrentTierBadgeProps> = ({ tier, size, testId }) => {
  const src = badgeArt(tier);
  const [readySrc, setReadySrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    setReadySrc(null);
    if (src === null) return;

    let active = true;
    const preload = new Image();
    const reveal = () => {
      if (active) setReadySrc(src);
    };
    preload.onload = reveal;
    preload.onerror = () => {
      if (active) setReadySrc(null);
    };
    preload.src = src;

    if (preload.complete && preload.naturalWidth > 0) reveal();
    else if (typeof preload.decode === "function") preload.decode().then(reveal).catch(() => undefined);

    return () => {
      active = false;
      preload.onload = null;
      preload.onerror = null;
    };
  }, [src]);

  if (src === null || readySrc !== src) return null;

  return (
    <img
      data-testid={testId}
      data-tier={tier}
      src={src}
      alt={`${tierName(tier)} badge`}
      width={size}
      height={size}
      style={{ display: "block", flex: "0 0 auto" }}
    />
  );
};

export default CurrentTierBadge;