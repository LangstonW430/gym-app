import Papa from "papaparse";
import type { SetType, Units } from "@/convex/lib/shared";
import { e1rm, fromDisplay, toDisplay } from "@/convex/lib/shared";

export interface ImportedWorkout {
  name: string;
  startedAt: number;
  endedAt: number;
  notes?: string;
  sets: { exercise: string; setType: SetType; weight: number; reps: number; rir?: number; notes?: string }[];
}

type Row = Record<string, string>;

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Hevy: "15 Oct 2024, 18:30"; Strong: "2024-10-15 18:30:00". Falls back to Date.parse. */
export function parseDate(s: string): number {
  const t = s.trim();
  const hevy = /^(\d{1,2}) (\w{3}) (\d{4}),? (\d{1,2}):(\d{2})/.exec(t);
  if (hevy) {
    const [, d, mon, y, h, m] = hevy;
    return new Date(Number(y), MONTHS[mon.toLowerCase()] ?? 0, Number(d), Number(h), Number(m)).getTime();
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (iso) {
    const [, y, mo, d, h, m, sec] = iso;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(m), Number(sec ?? 0)).getTime();
  }
  const p = Date.parse(t);
  if (Number.isNaN(p)) throw new Error(`Unrecognised date: ${s}`);
  return p;
}

/** Strong durations: "1h 5m", "45m", "3600" (seconds). */
function parseDuration(s: string | undefined): number {
  if (!s) return 3600;
  if (/^\d+$/.test(s.trim())) return Number(s);
  const h = /(\d+)\s*h/.exec(s)?.[1] ?? "0";
  const m = /(\d+)\s*m/.exec(s)?.[1] ?? "0";
  return Number(h) * 3600 + Number(m) * 60 || 3600;
}

const num = (s: string | undefined) => {
  const n = Number(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const rirFromRpe = (s: string | undefined) => {
  const r = num(s);
  return r > 0 ? Math.max(0, Math.round(10 - r)) : undefined;
};

export function detectFormat(headers: string[]): "hevy" | "strong" | null {
  const h = headers.map((x) => x.trim().toLowerCase());
  if (h.includes("exercise_title") && h.includes("start_time")) return "hevy";
  if (h.includes("exercise name") && h.includes("workout name")) return "strong";
  return null;
}

/**
 * Parse a Hevy or Strong CSV export into workouts (weights in kg).
 * `units` is the unit the source app exported in, used when the file doesn't say.
 */
export function parseWorkoutCsv(text: string, units: Units): { format: "hevy" | "strong"; workouts: ImportedWorkout[] } {
  const parsed = Papa.parse<Row>(text.trim(), { header: true, skipEmptyLines: true });
  const format = detectFormat(parsed.meta.fields ?? []);
  if (!format) throw new Error("This doesn't look like a Hevy or Strong CSV export.");
  const groups = new Map<string, ImportedWorkout>();

  for (const raw of parsed.data) {
    const r: Row = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase(), (v ?? "").trim()]));
    if (format === "hevy") {
      const start = parseDate(r.start_time);
      const key = `${start}|${r.title}`;
      const w = groups.get(key) ?? {
        name: r.title || "Workout",
        startedAt: start,
        endedAt: r.end_time ? parseDate(r.end_time) : start + 3600_000,
        notes: r.description || undefined,
        sets: [],
      };
      groups.set(key, w);
      const reps = num(r.reps);
      if (!reps) continue; // cardio / timed sets
      const weight = r.weight_kg !== undefined ? num(r.weight_kg) : fromDisplay(num(r.weight_lbs), "lb");
      const type = r.set_type?.toLowerCase();
      w.sets.push({
        exercise: r.exercise_title,
        setType: type === "warmup" ? "warmup" : type === "dropset" ? "drop" : type === "failure" ? "failure" : "working",
        weight,
        reps,
        rir: rirFromRpe(r.rpe),
        notes: r.exercise_notes || undefined,
      });
    } else {
      const start = parseDate(r.date);
      const key = `${start}|${r["workout name"]}`;
      const w = groups.get(key) ?? {
        name: r["workout name"] || "Workout",
        startedAt: start,
        endedAt: start + parseDuration(r.duration) * 1000,
        notes: r["workout notes"] || undefined,
        sets: [],
      };
      groups.set(key, w);
      const reps = num(r.reps);
      if (!reps) continue;
      const order = (r["set order"] ?? "").toUpperCase();
      w.sets.push({
        exercise: r["exercise name"],
        setType: order === "W" ? "warmup" : order === "D" ? "drop" : order === "F" ? "failure" : "working",
        weight: fromDisplay(num(r.weight), units),
        reps,
        rir: rirFromRpe(r.rpe),
        notes: r.notes || undefined,
      });
    }
  }
  const workouts = [...groups.values()].filter((w) => w.sets.length > 0).sort((a, b) => a.startedAt - b.startedAt);
  return { format, workouts };
}

// ---------------------------------------------------------------------------
// Export

interface ExportData {
  exercises: { _id: string; name: string }[];
  workouts: { _id: string; name: string; startedAt: number; endedAt?: number; status: string; exercises: { key: string; notes?: string }[] }[];
  sets: { workoutId: string; exerciseId: string; exerciseKey: string; order: number; setType: string; weight: number; reps: number; rir?: number; completedAt?: number }[];
  bodyweight: { date: string; weight: number }[];
}

export function setsCsv(data: ExportData, units: Units): string {
  const exName = new Map(data.exercises.map((e) => [e._id, e.name]));
  const wById = new Map(data.workouts.map((w) => [w._id, w]));
  const rows = data.sets
    .filter((s) => s.completedAt && wById.get(s.workoutId)?.status === "done")
    .sort((a, b) => a.completedAt! - b.completedAt!)
    .map((s) => {
      const w = wById.get(s.workoutId)!;
      return {
        date: new Date(w.startedAt).toISOString(),
        workout: w.name,
        duration_min: w.endedAt ? Math.round((w.endedAt - w.startedAt) / 60000) : "",
        exercise: exName.get(s.exerciseId) ?? "",
        set_order: s.order + 1,
        set_type: s.setType,
        [`weight_${units}`]: toDisplay(s.weight, units),
        reps: s.reps,
        rir: s.rir ?? "",
        [`e1rm_${units}`]: s.setType === "warmup" ? "" : toDisplay(e1rm(s.weight, s.reps), units),
        exercise_notes: w.exercises.find((e) => e.key === s.exerciseKey)?.notes ?? "",
      };
    });
  return Papa.unparse(rows);
}

export function bodyweightCsv(data: ExportData, units: Units): string {
  return Papa.unparse(data.bodyweight.map((b) => ({ date: b.date, [`weight_${units}`]: toDisplay(b.weight, units) })));
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
