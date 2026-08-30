import React, { useState } from "react";
import { Settings, X } from "lucide-react";
import { COLORS, FONT_FAMILY } from "@/lib/tokens";
import SettingsSheet from "@/components/SettingsSheet";


const TOUCH = 44;

/** Bar height, excluding the safe-area inset that pads it from the top. */
export const SITE_HEADER_H = 44;
/** CSS length: bar height + notch inset. Use for page top offsets. */
export const SITE_HEADER_OFFSET = `calc(${SITE_HEADER_H}px + env(safe-area-inset-top))`;
/** DOM id — read by the in-game card sizer to measure the real bar height. */
export const SITE_HEADER_ID = "site-header";

export interface SiteHeaderProps {
  /** Provide to hand settings to the host screen; otherwise a built-in sheet opens. */
  onSettings?: () => void;
  /** In-game only: adds a leave control alongside settings in the right slot. */
  onLeave?: () => void;
}

/**
 * Persistent site header. Fixed to the top of the viewport, full width, on
 * every screen: support page, play-style screen, lobby and in-game. The bar
 * spans edge to edge; its contents are constrained to the 420px game column.
 */
const SiteHeader: React.FC<SiteHeaderProps> = ({ onSettings, onLeave }) => {
  const [showSettings, setShowSettings] = useState(false);
  const openSettings = onSettings ?? (() => setShowSettings(true));

  const controlBase: React.CSSProperties = {
    minHeight: TOUCH,
    minWidth: TOUCH,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    lineHeight: 1,
    color: COLORS.surface,
    textDecoration: "none",
    background: "transparent",
    border: "none",
    padding: "0 8px",
    whiteSpace: "nowrap",
    cursor: "pointer",
  };

  return (
    <>
      <header
        id={SITE_HEADER_ID}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          width: "100%",
          height: SITE_HEADER_OFFSET,
          paddingTop: "env(safe-area-inset-top)",
          background: COLORS.ink,
          borderBottom: `2px solid ${COLORS.surface}`,
          boxSizing: "border-box",
          zIndex: 50,
        }}
      >
        <nav
          aria-label="Main"
          style={{
            maxWidth: 420,
            margin: "0 auto",
            height: SITE_HEADER_H,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
            paddingLeft: 4,
            paddingRight: 4,
            boxSizing: "border-box",
          }}
        >
          <a href="/about#how-to-play" style={{ ...controlBase, flex: "none" }}>
            How to Play
          </a>


          <div style={{ display: "flex", alignItems: "center", flex: "none" }}>
            <button
              type="button"
              onClick={openSettings}
              aria-label="Settings"
              style={{ ...controlBase, width: TOUCH, height: TOUCH, padding: 0 }}
            >
              <Settings size={22} color={COLORS.surface} aria-hidden="true" />
            </button>
            {onLeave && (
              <button
                type="button"
                onClick={onLeave}
                aria-label="Leave game"
                style={{ ...controlBase, width: TOUCH, height: TOUCH, padding: 0 }}
              >
                <X size={22} color={COLORS.surface} aria-hidden="true" />
              </button>
            )}
          </div>
        </nav>
      </header>

      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </>
  );
};

export default SiteHeader;
