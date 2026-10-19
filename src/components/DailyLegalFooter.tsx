import React from "react";
import { Link } from "react-router-dom";
import { COLORS, FONT_FAMILY_UI, FONT_WEIGHT_UI, SPACE } from "@/lib/tokens";

const CONTACT = "hello@whoop-whoop.com";

const linkStyle: React.CSSProperties = {
  fontFamily: FONT_FAMILY_UI,
  fontWeight: FONT_WEIGHT_UI,
  fontSize: 11,
  lineHeight: 1.2,
  color: COLORS.inkMuted,
  textDecoration: "none",
  borderBottom: `1px solid ${COLORS.inkMuted}`,
  paddingBottom: 1,
};

/**
 * Quiet legal footer for the ready screen: Privacy, Terms, contact. Deliberately
 * tiny (one 13px line) so it can sit under the CTA without pushing the fixed
 * daily viewport into scrolling on small phones.
 */
const DailyLegalFooter: React.FC = () => (
  <nav
    aria-label="Legal"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: SPACE[4],
      opacity: 0.85,
    }}
  >
    <Link to="/about" style={linkStyle}>
      About
    </Link>
    <Link to="/privacy" style={linkStyle}>
      Privacy
    </Link>
    <Link to="/terms" style={linkStyle}>
      Terms
    </Link>
    <Link to="/faq" style={linkStyle}>
      FAQ
    </Link>
    <a href={`mailto:${CONTACT}`} style={linkStyle}>
      {CONTACT}
    </a>
  </nav>
);

export default DailyLegalFooter;
