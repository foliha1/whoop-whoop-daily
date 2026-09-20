import React from "react";
import { Helmet } from "react-helmet-async";
import SiteHeader, { SITE_HEADER_OFFSET } from "@/components/SiteHeader";
import {
  COLORS,
  SPACE,
  RADIUS,
  BORDER,
  TEXT,
  TEXT_ROLES,
  FONT_SIZE,
  textStyle,
  type TextRole,
} from "@/lib/tokens";

const SAMPLE = "WHOOP! WHOOP! deals a fast hand.";

const roleOrder: TextRole[] = [
  "display",
  "heading",
  "subhead",
  "label",
  "body",
  "caption",
  "captionItalic",
];

const TypographyPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Typography – WHOOP! WHOOP!</title>
        <meta name="description" content="Preview of every text role in the WHOOP! WHOOP! design system." />
      </Helmet>
      <div
        style={{
          minHeight: "var(--ww-vh)",
          background: COLORS.ink,
          color: COLORS.surface,
          paddingTop: SITE_HEADER_OFFSET,
        }}
      >
        <SiteHeader />
        <main
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: `${SPACE[12]}px ${SPACE[6]}px`,
            display: "flex",
            flexDirection: "column",
            gap: SPACE[12],
          }}
        >
          <header>
            <h1
              style={{
                ...textStyle("title"),
                margin: `0 0 ${SPACE[4]}px`,
              }}
            >
              Typography
            </h1>
            <p
              style={{
                ...textStyle("body"),
                color: COLORS.panelMuted,
                margin: 0,
              }}
            >
              Every TEXT role rendered at desktop and mobile sizes.
            </p>
          </header>

          <section
            style={{
              display: "flex",
              flexDirection: "column",
              gap: SPACE[6],
            }}
          >
            {roleOrder.map((role) => {
              const def = TEXT[role];
              const meta = TEXT_ROLES[role];
              return (
                <article
                  key={role}
                  style={{
                    background: COLORS.surface,
                    color: COLORS.ink,
                    border: BORDER.heavy,
                    borderRadius: RADIUS.md,
                    padding: SPACE[8],
                    display: "flex",
                    flexDirection: "column",
                    gap: SPACE[6],
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: SPACE[4],
                      flexWrap: "wrap",
                    }}
                  >
                    <h2
                      style={{
                        ...textStyle("subhead"),
                        margin: 0,
                      }}
                    >
                      {role}
                    </h2>
                    <div
                      style={{
                        ...textStyle("caption"),
                        color: COLORS.inkMuted,
                        display: "flex",
                        gap: SPACE[6],
                        flexWrap: "wrap",
                      }}
                    >
                      <span>desktop {def.size}px</span>
                      <span>mobile {def.mobileSize}px</span>
                      <span>family {def.family === "ui" ? "Geist" : "Friend"}</span>
                      <span>weight {def.weight}</span>
                      <span>line-height {def.lineHeight}</span>
                      {meta.italic && <span>italic</span>}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: SPACE[4],
                    }}
                  >
                    <div
                      style={{
                        ...textStyle(role),
                        color: COLORS.ink,
                      }}
                    >
                      <span
                        style={{
                          ...textStyle("caption"),
                          display: "inline-block",
                          color: COLORS.inkMuted,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: SPACE[2],
                        }}
                      >
                        Desktop
                      </span>
                      <div>{SAMPLE}</div>
                    </div>

                    <div
                      style={{
                        ...textStyle(role, true),
                        color: COLORS.ink,
                      }}
                    >
                      <span
                        style={{
                          ...textStyle("caption", true),
                          display: "inline-block",
                          color: COLORS.inkMuted,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: SPACE[2],
                        }}
                      >
                        Mobile
                      </span>
                      <div>{SAMPLE}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </main>
      </div>
    </>
  );
};

export default TypographyPage;
