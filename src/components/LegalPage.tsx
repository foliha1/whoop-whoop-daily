import React from "react";
import { useUmbrella } from "@/lib/launch";
import HomeControl from "@/components/HomeControl";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import DailyFrame from "@/components/DailyFrame";
import { useIsMobile } from "@/hooks/use-mobile";
import { COLORS, FONT_FAMILY_UI, FONT_WEIGHT_UI, SPACE, textStyle } from "@/lib/tokens";

export const LEGAL_CONTACT = "hello@whoop-whoop.com";

/**
 * Shared shell for the legal pages. Same cream frame and shape rules as every
 * other daily screen (so the night theme comes for free), with a readable
 * measure of Geist body copy under a Friend heading.
 */
const LegalPage: React.FC<{
  title: string;
  metaTitle: string;
  metaDescription: string;
  path: string;
  updated: string;
  children: React.ReactNode;
}> = ({ title, metaTitle, metaDescription, path, updated, children }) => {
  const mobile = useIsMobile();
  const url = `https://whoop-whoop.com${path}`;
  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
      </Helmet>
      <DailyFrame gap={SPACE[10]}>
        <article
          style={{
            alignSelf: "stretch",
            display: "flex",
            flexDirection: "column",
            gap: SPACE[8],
            paddingTop: SPACE[6],
            paddingBottom: SPACE[10],
          }}
        >
          <header style={{ display: "flex", flexDirection: "column", gap: SPACE[3] }}>
            <h1 style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0 }}>{title}</h1>
            <p style={{ ...bodyStyle, color: COLORS.inkMuted, margin: 0, fontStyle: "italic" }}>
              Last updated {updated}
            </p>
          </header>
          {children}
          <Link
            to={umbrella ? "/daily" : "/"}
            style={{
              ...bodyStyle,
              color: COLORS.inkMuted,
              textDecoration: "underline",
              alignSelf: "flex-start",
            }}
          >
            Back to the daily
          </Link>
        </article>
      </DailyFrame>
    </>
  );
};

export const bodyStyle: React.CSSProperties = {
  fontFamily: FONT_FAMILY_UI,
  fontWeight: FONT_WEIGHT_UI,
  fontSize: 14,
  lineHeight: 1.55,
  color: COLORS.ink,
  margin: 0,
};

/** Section: Friend subhead plus Geist body blocks. */
export const LegalSection: React.FC<{ heading: string; children: React.ReactNode }> = ({
  heading,
  children,
}) => (
  <section style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
    <h2 style={{ ...textStyle("subhead"), color: COLORS.ink, margin: 0 }}>{heading}</h2>
    {children}
  </section>
);

export const LegalText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={bodyStyle}>{children}</p>
);

export const LegalList: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul style={{ ...bodyStyle, paddingLeft: 18, display: "grid", gap: SPACE[3] }}>
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

export const MailLink: React.FC = () => (
  <a href={`mailto:${LEGAL_CONTACT}`} style={{ color: COLORS.blue }}>
    {LEGAL_CONTACT}
  </a>
);

export default LegalPage;
