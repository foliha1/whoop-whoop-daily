import React from "react";
import { COLORS } from "@/lib/tokens";
import SiteHeader, { SITE_HEADER_OFFSET } from "@/components/SiteHeader";
import { MOBILE_SHELL_PAD, DESKTOP_SHELL_PAD } from "@/lib/layout";

export { MOBILE_SHELL_PAD };


export const shellPadding = (mobile: boolean): React.CSSProperties => {
  const p = mobile ? MOBILE_SHELL_PAD : DESKTOP_SHELL_PAD;
  return {
    padding: p,
    paddingTop: mobile
      ? `calc(${p}px + ${SITE_HEADER_OFFSET})`
      : `calc(20px + ${SITE_HEADER_OFFSET})`,
    paddingBottom: `calc(${p}px + env(safe-area-inset-bottom))`,
    paddingLeft: `calc(${p}px + env(safe-area-inset-left))`,
    paddingRight: `calc(${p}px + env(safe-area-inset-right))`,
  };
};

export const shellStyleFor = (mobile: boolean): React.CSSProperties => ({
  position: "relative",
  minHeight: mobile ? "var(--ww-vh)" : "100%",
  height: mobile ? "var(--ww-vh)" : "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  ...shellPadding(mobile),
  boxSizing: "border-box",
  overflowY: "auto",
  background: mobile ? COLORS.surface : "transparent",
});

export const PRE_GAME_INNER_MAX_W = 390;

interface PreGameShellProps {
  mobile: boolean;
  /** Render the fixed site header (default true). */
  nav?: boolean;
  /** Gap between children inside the centred column. */
  gap?: number;
  /** Skip the max-width centred column and render children directly. */
  bare?: boolean;
  /** Opens the multiplayer How to Play stepper instead of navigating to /about. */
  onHowTo?: () => void;
  children?: React.ReactNode;
}

const PreGameShell: React.FC<PreGameShellProps> = ({
  mobile,
  nav = true,
  gap = 0,
  bare = false,
  onHowTo,
  children,
}) => (
  <div className="mp-shell" style={shellStyleFor(mobile)}>
    <style>{`
      .mp-shell button:not(.ww-grid-option) { transition: filter 120ms ease, background 120ms ease; }
      .mp-shell button:not(:disabled):hover { filter: brightness(1.15); }
      .mp-shell button:not(:disabled):active { filter: brightness(0.95); }
      .mp-shell [role="textbox"]:focus { box-shadow: 0 0 0 2px #0072B2 inset; }
      .mp-shell input::placeholder { color: ${COLORS.panel}; opacity: 1; }
    `}</style>
    {nav && <SiteHeader onHowTo={onHowTo} />}
    {bare ? (
      children
    ) : (
      <div
        style={{
          width: "100%",
          maxWidth: PRE_GAME_INNER_MAX_W,
          height: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap,
        }}
      >
        {children}
      </div>
    )}
  </div>
);

export default PreGameShell;
