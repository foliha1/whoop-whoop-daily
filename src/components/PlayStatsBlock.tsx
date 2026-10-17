import React from "react";
import CardFlipLoader from "@/components/CardFlipLoader";
import { fetchMatchHistory, localMatchHistory, summarizeMatches, formatVictory } from "@/lib/playerStats";
import { BORDER, COLORS, RADIUS, SPACE, textStyle } from "@/lib/tokens";

export default function PlayStatsBlock({ mode, mobile }: { mode: "solo" | "together"; mobile: boolean }) {
  const [history, setHistory] = React.useState(localMatchHistory);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    setLoading(true);
    void fetchMatchHistory().then((value) => { if (live) { setHistory(value); setError(false); } })
      .catch(() => { if (live) setError(true); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  const stats = summarizeMatches(history, mode);
  const extras: [string, string][] = mode === "solo"
    ? [
      ["Claim Accuracy", stats.accuracy === null ? "—" : `${stats.accuracy}%`],
      ["Quickest Victory", formatVictory(stats.quickest)],
      ["Total Pairs", stats.pairs === null ? "—" : `${stats.pairs}`],
    ]
    : [["Tables Hosted", `${stats.hosted}`]];
  const rows: [string, string][] = [
    ["Matches Played", `${stats.played}`],
    [mode === "solo" ? "Solo Wins" : "1st Place Wins", `${stats.wins}`],
    ["Win Rate", stats.winRate === null ? "—" : `${stats.winRate}%`],
    ...extras,
  ];
  if (loading && !history.games.length && !history.tables.length) return <CardFlipLoader label={`Loading ${mode === "solo" ? "Solo" : "Together"} Stats`} />;
  return <div style={{ display: "flex", flexDirection: "column", gap: SPACE[8] }}>
    {error && <p role="status" style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0 }}>Couldn’t refresh your stats. Showing this device’s saved results.</p>}
    <div data-testid="play-stats" style={{ display: "grid", gridTemplateColumns: mobile ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: SPACE[4] }}>
      {rows.map(([label, value]) => <div key={label} style={{ minWidth: 0, border: BORDER.heavy, borderRadius: RADIUS.md, background: COLORS.surface, padding: SPACE[6], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SPACE[4], textAlign: "center" }}>
        <span style={{ ...textStyle("display", mobile), ...(label === "Quickest Victory" ? textStyle("title", mobile) : {}), color: COLORS.ink, overflowWrap: "anywhere" }}>{value}</span>
        <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, overflowWrap: "normal" }}>{label}</span>
      </div>)}
    </div>
  </div>;
}