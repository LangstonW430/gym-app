import { toDisplay, type Units } from "@/convex/lib/shared";

export function fmtNum(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.0+$/, "");
}

export function fmtW(kg: number, units: Units, withUnit = true): string {
  const v = fmtNum(toDisplay(kg, units));
  return withUnit ? `${v} ${units}` : v;
}

export function fmtVolume(kg: number, units: Units): string {
  const v = toDisplay(kg, units);
  return `${v >= 10000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toLocaleString()} ${units}`;
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtMinutes(sec: number): string {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

export function fmtDate(ts: number, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(ts).toLocaleDateString(undefined, opts);
}

export function fmtRelativeDay(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return fmtDate(ts);
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export const SET_TYPE_LABEL = { warmup: "W", working: "", drop: "D", failure: "F" } as const;
