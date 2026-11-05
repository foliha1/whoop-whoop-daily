import { todayIso } from "@/lib/adminExport";

/** Inclusive local-calendar windows, matching the dashboard's date inputs. */
export function adminDateRange(days: number, now = new Date()) {
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  return { from: todayIso(from), to: todayIso(now) };
}

/** Chart geometry only: raw counts and conversion rates remain untouched. */
export function adminBarPercent(count: number, baseline: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(baseline) || baseline <= 0) return 0;
  return Math.min(100, Math.max(0, count / baseline * 100));
}