// ============================================================================
// SettingsSheet — the one settings modal, shared by the site header and the
// multiplayer in-game view.
//
// Contents: Appearance (Light / Night / System), Sound effects toggle, Music
// toggle, a How to Play link, and a close control. Escape and a backdrop
// click both close it.
//
// Note on type: Friend ships a single weight, so nothing here uses
// fontWeight: 700 — the browser would fake it and smear the letters. Contrast
// comes from size, letter-spacing and case instead.
// ============================================================================

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { COLORS, FONT_FAMILY, RADIUS, BORDER } from "@/lib/tokens";
import { useThemeMode, type ThemeMode } from "@/lib/nightMode";
import {
  getSfxEnabled,
  setSfxEnabled,
  getMusicEnabled,
  setMusicEnabled,
} from "@/lib/sounds";
import CloseButton from "@/components/CloseButton";

const TOUCH = 44;

const APPEARANCE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "night", label: "Night" },
  { value: "system", label: "System" },
];

const labelStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: FONT_FAMILY,
  fontSize: 13,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: COLORS.inkMuted,
};

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      minHeight: TOUCH,
    }}
  >
    <span style={{ ...labelStyle, color: COLORS.ink }}>{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="ww-press"
      style={{
        all: "unset",
        cursor: "pointer",
        boxSizing: "border-box",
        flex: "none",
        width: 56,
        height: 32,
        borderRadius: 16,
        border: BORDER.heavy,
        background: checked ? COLORS.ink : "transparent",
        position: "relative",
        // enlarge the hit area to 44px without growing the visible switch
        margin: "6px 0",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          left: checked ? 28 : 4,
          transform: "translateY(-50%)",
          width: 20,
          height: 20,
          borderRadius: 10,
          background: checked ? COLORS.surface : COLORS.ink,
          transition: "left 150ms ease",
        }}
      />
      {/* invisible 44px hit surface */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          height: TOUCH,
        }}
      />
    </button>
  </div>
);

export interface SettingsSheetProps {
  onClose: () => void;
  /** When provided, How to Play opens the in-app stepper instead of /about. */
  onHowTo?: () => void;
}

/** Shared by the link and the button form of the How to Play control. */
const howToStyle: React.CSSProperties = {
  minHeight: TOUCH,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: FONT_FAMILY,
  fontSize: 16,
  color: COLORS.ink,
  textDecoration: "none",
  border: BORDER.heavy,
  borderRadius: RADIUS.sm,
  boxSizing: "border-box",
};

const SettingsSheet: React.FC<SettingsSheetProps> = ({ onClose, onHowTo }) => {
  const { mode, setMode } = useThemeMode();
  const [sfx, setSfx] = useState(() => getSfxEnabled());
  const [music, setMusic] = useState(() => getMusicEnabled());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Rendered through a portal: the callers sit inside scaled/faded columns
  // (FitColumn, DailyScreenFade), and a transformed ancestor turns
  // `position: fixed` into a container-relative box — which is what squeezed
  // and clipped this sheet inside the content column.
  const sheet = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-sheet-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(35,31,32,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 340,
          background: COLORS.surface,
          border: BORDER.heavy,
          borderRadius: RADIUS.sm,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2
            id="settings-sheet-title"
            style={{
              margin: 0,
              fontFamily: FONT_FAMILY,
              fontSize: 22,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: COLORS.ink,
            }}
          >
            Settings
          </h2>
          <CloseButton
            label="CLOSE"
            onClick={onClose}
            ariaLabel="Close settings"
            data-testid="settings-sheet-close"
          />
        </div>

        {/* Appearance */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={labelStyle}>Appearance</p>
          <div role="group" aria-label="Appearance" style={{ display: "flex", gap: 8 }}>
            {APPEARANCE_OPTIONS.map((opt) => {
              const active = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMode(opt.value)}
                  className="ww-press"
                  style={{
                    flex: 1,
                    minHeight: TOUCH,
                    cursor: "pointer",
                    fontFamily: FONT_FAMILY,
                    fontSize: 15,
                    letterSpacing: "0.03em",
                    color: active ? COLORS.surface : COLORS.ink,
                    background: active ? COLORS.ink : "transparent",
                    border: BORDER.heavy,
                    borderRadius: RADIUS.sm,
                    boxSizing: "border-box",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sound effects */}
        <Toggle
          label="Sound effects"
          checked={sfx}
          onChange={(next) => {
            setSfxEnabled(next);
            setSfx(next);
          }}
        />

        {/* Music */}
        <Toggle
          label="Music"
          checked={music}
          onChange={(next) => {
            setMusicEnabled(next);
            setMusic(next);
          }}
        />

        {onHowTo ? (
          <button type="button" onClick={onHowTo} style={{ ...howToStyle, cursor: "pointer", background: "transparent" }}>
            How to Play
          </button>
        ) : (
          <a href="/about#how-to-play" style={howToStyle}>
            How to Play
          </a>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return sheet;
  return createPortal(sheet, document.body);
};

export default SettingsSheet;
