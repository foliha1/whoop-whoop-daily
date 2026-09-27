import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { getDailyNumber, getDailySeed, loadDailyResult } from "@/lib/daily";
import { fetchFirstAttempt } from "@/lib/dailyResults";
import { whenAccountReady } from "@/lib/account";
import { useThemeMode } from "@/lib/nightMode";
import { BORDER, COLORS, FONT_FAMILY, RAW, RADIUS, SPACE, textStyle } from "@/lib/tokens";

const nextMidnight = (now: Date): number =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

export function formatNextPuzzle(now: Date = new Date()): string {
  const hours = Math.max(1, Math.ceil((nextMidnight(now) - now.getTime()) / 3_600_000));
  return `Next puzzle in ${hours}h`;
}

type HomeCardProps = {
  title: string;
  copy: string;
  to: string;
  background: string;
  color: string;
  detail?: string;
  testId: string;
};

const HomeCard: React.FC<HomeCardProps> = ({ title, copy, to, background, color, detail, testId }) => (
  <Link
    to={to}
    data-testid={testId}
    className="ww-home-card ww-press"
    style={{ background, color, border: BORDER.heavy, borderRadius: RADIUS.md }}
  >
    <span style={{ ...textStyle("heading", true), color }}>{title}</span>
    <span style={{ ...textStyle("body", true), color }}>{copy}</span>
    {detail ? <span style={{ ...textStyle("caption", true), color }}>{detail}</span> : null}
  </Link>
);

const HomePage: React.FC = () => {
  const location = useLocation();
  const { theme } = useThemeMode();
  const [now, setNow] = useState(() => new Date());
  const puzzleNumber = getDailyNumber(now);
  const locallyPlayed = useMemo(() => loadDailyResult(getDailySeed(now)) !== null, [now]);
  const [played, setPlayed] = useState(locallyPlayed);
  const query = location.search;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setPlayed(locallyPlayed);
    if (locallyPlayed) return;
    let live = true;
    void whenAccountReady()
      .then(() => fetchFirstAttempt(puzzleNumber, null))
      .then((result) => { if (live && result) setPlayed(true); });
    return () => { live = false; };
  }, [locallyPlayed, puzzleNumber]);

  return (
    <main className="ww-home" data-testid="umbrella-home">
      <Helmet>
        <title>WHOOP! WHOOP!</title>
        <meta name="description" content="The memory game where the rules keep changing. Play the Daily, go Solo, or play with friends." />
        <link rel="canonical" href="https://whoop-whoop.com/" />
        <meta property="og:title" content="WHOOP! WHOOP!" />
        <meta property="og:description" content="The memory game where the rules keep changing. Play the Daily, go Solo, or play with friends." />
        <meta property="og:url" content="https://whoop-whoop.com/" />
      </Helmet>
      <img
        className="ww-home-logo"
        src={theme === "night" ? "/WhoopWhoop_Stacked_Logo.svg" : "/WhoopWhoop_Dark_Logo.svg"}
        alt="WHOOP! WHOOP!"
      />
      <nav className="ww-home-cards" aria-label="Choose a game">
        <HomeCard
          title={played ? "See Today's Daily" : `Play Daily #${puzzleNumber}`}
          copy="Nine cards. Ten seconds. Remember."
          detail={played ? formatNextPuzzle(now) : undefined}
          to={`/daily${query}`}
          background={RAW.orange}
          color={RAW.warmBlack}
          testId="home-daily"
        />
        <HomeCard
          title="Solo"
          copy="Play the full game on your own."
          to={`/classic?mode=solo${query ? `&${query.slice(1)}` : ""}`}
          background={RAW.blue}
          color={RAW.cream}
          testId="home-solo"
        />
        <HomeCard
          title="Play with Peeps"
          copy="Start a table or join your people."
          to={`/classic?mode=multiplayer${query ? `&${query.slice(1)}` : ""}`}
          background={RAW.red}
          color={RAW.cream}
          testId="home-peeps"
        />
      </nav>
      <p style={{ ...textStyle("caption", true), color: COLORS.inkMuted, margin: 0 }}>
        Pick your way to play.
      </p>
    </main>
  );
};

export default HomePage;