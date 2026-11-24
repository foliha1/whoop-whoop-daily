import React from "react";
import { Link } from "react-router-dom";
import { COLORS, FONT_FAMILY_UI, FONT_WEIGHT_UI, SPACE } from "@/lib/tokens";

const CONTACT = "hello@whoop-whoop.com";

const textBase: React.CSSProperties = {
  fontFamily: FONT_FAMILY_UI,
  fontWeight: FONT_WEIGHT_UI,
  fontSize: 11,
  lineHeight: 1.2,
  color: COLORS.inkMuted,
};

const linkStyle: React.CSSProperties = {
  ...textBase,
  textDecoration: "none",
  borderBottom: `1px solid ${COLORS.inkMuted}`,
  paddingBottom: 1,
};

/** Quiet shared footer: legal links, contact and the studio copyright. */
const DailyLegalFooter: React.FC = () => (
  <footer
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACE[2],
      opacity: 0.85,
    }}
  >
    <nav
      aria-label="Legal"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: SPACE[4],
      }}
    >
      <Link to="/about" style={linkStyle}>About</Link>
      <Link to="/privacy" style={linkStyle}>Privacy</Link>
      <Link to="/terms" style={linkStyle}>Terms</Link>
      <Link to="/faq" style={linkStyle}>FAQ</Link>
      <a href={`mailto:${CONTACT}`} style={linkStyle}>{CONTACT}</a>
    </nav>
    <span style={textBase}>©2026 Oleeha & Co.</span>
  </footer>
);

export default DailyLegalFooter;
