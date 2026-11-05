import type { CSSProperties } from "react";
import { adminBarPercent } from "@/lib/adminPresentation";
import { COLORS, FONT_FAMILY_UI, FONT_SIZE, RADIUS, SPACE } from "@/lib/tokens";

export interface AdminBarRow {
  label: string;
  count: number;
  detail?: string;
  color?: string;
}

const text: CSSProperties = {
  fontFamily: FONT_FAMILY_UI,
  fontSize: FONT_SIZE.xs,
  fontVariantNumeric: "tabular-nums",
  color: COLORS.ink,
};

export function AdminMetricBars({ rows, baseline }: { rows: AdminBarRow[]; baseline: number }) {
  return (
    <dl style={{ margin: 0, display: "grid", gap: SPACE[6], minWidth: 0 }}>
      {rows.map((row) => (
        <div key={row.label} style={{ minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: SPACE[3], marginBottom: SPACE[3] }}>
            <dt style={text}>{row.label}</dt>
            <dd style={{ ...text, margin: 0, fontWeight: 600 }}>
              {row.count.toLocaleString()}
              {row.detail ? <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}> · {row.detail}</span> : null}
            </dd>
          </div>
          <div aria-hidden="true" style={{ height: SPACE[5], background: COLORS.panelMuted, borderRadius: RADIUS.sm, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${adminBarPercent(row.count, baseline)}%`, background: row.color ?? COLORS.blue, borderRadius: RADIUS.sm }} />
          </div>
        </div>
      ))}
    </dl>
  );
}