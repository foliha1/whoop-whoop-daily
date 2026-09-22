import React from "react";
import type { PointsTier } from "@/lib/whoopPoints";
import { badgeArt, tierName } from "@/lib/whoopTiers";
import { loadBadgeImage } from "@/lib/badgeImages";

type CurrentTierBadgeProps = {
  tier: PointsTier;
  size: number;
  testId?: string;
  /** Let a token-sized wrapper scale the decoded art with its layout cell. */
  fluid?: boolean;
};

/**
 * Fixed brand art for the player's current tier. The asset is decoded before
 * the visible image mounts, so a missing or slow image never leaves a broken
 * image or an empty layout slot behind.
 */
const CurrentTierBadge: React.FC<CurrentTierBadgeProps> = ({ tier, size, testId, fluid = false }) => {
  const src = badgeArt(tier);
  const [readySrc, setReadySrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    setReadySrc(null);
    if (src === null) return;

    let active = true;
    void loadBadgeImage(tier).then((image) => {
      if (active) setReadySrc(image === null ? null : src);
    });

    return () => {
      active = false;
    };
  }, [src, tier]);

  if (src === null || readySrc !== src) return null;

  return (
    <img
      className="ww-ui-small-in"
      data-testid={testId}
      data-tier={tier}
      src={src}
      alt={`${tierName(tier)} badge`}
      width={size}
      height={size}
      style={{
        display: "block",
        flex: "0 0 auto",
        ...(fluid ? { width: "100%", height: "auto" } : null),
      }}
    />
  );
};

export default CurrentTierBadge;