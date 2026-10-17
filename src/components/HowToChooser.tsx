// ON-only: Home/Settings "How to Play" asks which game to learn first.
import React from "react";
import { createPortal } from "react-dom";
import { COLORS, CONTROL_H, SPACE, buttonStyle, panelStyle, textStyle } from "@/lib/tokens";

const HowToChooser: React.FC<{
  onDaily: () => void;
  onClassic: () => void;
  onClose: () => void;
}> = ({ onDaily, onClassic, onClose }) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const btn: React.CSSProperties = { flexGrow: 1, flexBasis: 0, height: CONTROL_H.lg + SPACE[2], padding: 0 };
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="howto-chooser-title"
      data-testid="howto-chooser"
      className="ww-ui-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(35, 31, 32, 0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: SPACE[8], zIndex: 1000,
      }}
    >
      <div className="ww-ui-modal-panel" style={{ ...panelStyle("surface", 8), width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: SPACE[8] }}>
        <div id="howto-chooser-title" style={{ ...textStyle("title"), color: COLORS.ink, textAlign: "center" }}>
          How to Play
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE[5] }}>
          <button type="button" autoFocus data-testid="howto-daily" onClick={onDaily} className="ww-press" style={{ ...buttonStyle("primary", "lg"), ...btn, width: "100%" }}>
            Daily
          </button>
          <button type="button" data-testid="howto-classic" onClick={onClassic} className="ww-press" style={{ ...buttonStyle("secondary", "lg"), ...btn, width: "100%" }}>
            Solo &amp; Together
          </button>
          <button type="button" onClick={onClose} className="ww-press" style={{ ...buttonStyle("quiet", "md"), width: "100%" }}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default HowToChooser;
