"use client";

import { useQuery } from "convex/react";
import { ChevronRight, Pin, Scale, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MuscleSetsChart, WeeklyCountChart } from "@/components/charts/charts";
import { Empty, Page, PageHeader, Section } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { api } from "@/convex/_generated/api";
import { startOfWeek, WEEKLY_SET_TARGET } from "@/convex/lib/shared";
import { fmtDate, fmtW } from "@/lib/format";
import { useMountTime } from "@/lib/hooks";
import { useSettings } from "@/lib/settings";

const DEFAULT_PINS = ["Squat (Barbell)", "Bench Press (Barbell)", "Romanian Deadlift (Barbell)", "Bent Over Row (Barbell)"];

export default function ProgressPage() {
  const { units, pinnedExerciseIds } = useSettings();
  const exercises = useQuery(api.exercises.list, {});
  const records = useQuery(api.stats.records);
  const [q, setQ] = useState("");
  const [week, setWeek] = useState<"this" | "last">("this");

  const now = useMountTime();
  const ranges = useMemo(() => {
    const tz = new Date(now).getTimezoneOffset();
    const ws = startOfWeek(now);
    return {
      muscles: { from: ws - 7 * 86_400_000, to: ws + 7 * 86_400_000, tzOffsetMin: tz },
      consistency: { from: now - 365 * 86_400_000, tzOffsetMin: tz },
      thisWeek: ws,
    };
  }, [now]);
  const weekly = useQuery(api.stats.weeklyMuscles, ranges.muscles);
  const consistency = useQuery(api.stats.consistency, ranges.consistency);

  const pinned = useMemo(() => {
    if (!exercises) return [];
    const ids = pinnedExerciseIds.length ? pinnedExerciseIds : exercises.filter((e) => DEFAULT_PINS.includes(e.name)).map((e) => e._id);
    return ids.map((id) => exercises.find((e) => e._id === id)).filter((e): e is NonNullable<typeof e> => !!e);
  }, [exercises, pinnedExerciseIds]);

  const withData = new Set((records ?? []).map((r) => r.exerciseId));
  const matches = q
    ? (exercises ?? []).filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(withData.has(b._id)) - Number(withData.has(a._id)))
    : [];

  const targetWeek = week === "this" ? ranges.thisWeek : ranges.thisWeek - 7 * 86_400_000;
  const weekData = weekly?.find((w) => Math.abs(w.weekStart - targetWeek) < 2 * 3600_000);
  const muscleRows = Object.entries(weekData?.muscles ?? {})
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);

  return (
    <>
      <PageHeader
        title="Progress"
        action={
          <Link href="/bodyweight" className="flex h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted">
            <Scale className="size-4" /> Bodyweight
          </Link>
        }
      />
      <Page>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an exercise" className="pl-9" />
        </div>
        {q && (
          <Card>
            <ul className="max-h-72 divide-y overflow-y-auto">
              {matches.slice(0, 30).map((e) => (
                <li key={e._id}>
                  <Link href={`/progress/${e._id}`} className="flex min-h-12 items-center justify-between px-4">
                    <span>{e.name}</span>
                    {!withData.has(e._id) && <span className="text-xs text-muted-foreground">no data</span>}
                  </Link>
                </li>
              ))}
              {matches.length === 0 && <li className="p-4 text-sm text-muted-foreground">No matches</li>}
            </ul>
          </Card>
        )}

        <Section title="Pinned">
          <div className="grid grid-cols-2 gap-2">
            {pinned.map((e) => {
              const r = records?.find((x) => x.exerciseId === e._id);
              return (
                <Link key={e._id} href={`/progress/${e._id}`}>
                  <Card className="h-full transition-colors hover:bg-muted/50">
                    <CardContent className="p-3">
                      <p className="flex items-start gap-1 text-sm font-medium leading-tight">
                        <Pin className="mt-0.5 size-3 shrink-0 text-primary" />
                        {e.name}
                      </p>
                      <p className="num mt-2 text-xl font-semibold">{r?.bestE1rm ? fmtW(r.bestE1rm, units) : "—"}</p>
                      <p className="text-xs text-muted-foreground">best e1RM</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </Section>

        <Section
          title="Sets per muscle"
          action={
            <Segmented
              value={week}
              onChange={setWeek}
              options={[
                { value: "this", label: "This wk" },
                { value: "last", label: "Last wk" },
              ]}
            />
          }
        >
          <Card>
            <CardContent className="p-3">
              {muscleRows.length ? (
                <>
                  <MuscleSetsChart data={muscleRows} band={WEEKLY_SET_TARGET} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Shaded band: {WEEKLY_SET_TARGET.min}–{WEEKLY_SET_TARGET.max} working sets/week. Secondary muscles count half.
                  </p>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No working sets logged {week === "this" ? "this" : "last"} week.</p>
              )}
            </CardContent>
          </Card>
        </Section>

        <Section title="Consistency · workouts per week">
          <Card>
            <CardContent className="p-3">
              {consistency && consistency.length ? <WeeklyCountChart data={consistency} /> : <p className="py-6 text-center text-sm text-muted-foreground">Log a workout to start the chart.</p>}
            </CardContent>
          </Card>
        </Section>

        <Section title="Personal records">
          {records && records.length === 0 && <Empty>Records appear as you log working sets.</Empty>}
          {records && records.length > 0 && (
            <Card>
              <ul className="divide-y">
                {records.map((r) => (
                  <li key={r.exerciseId}>
                    <Link href={`/progress/${r.exerciseId}`} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.exercise}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(r.achievedAt)}</p>
                      </div>
                      <div className="num text-right text-sm">
                        <p>{r.bestWeight ? fmtW(r.bestWeight, units) : "—"}</p>
                        <p className="text-xs text-muted-foreground">e1RM {r.bestE1rm ? fmtW(r.bestE1rm, units) : "—"}</p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>
      </Page>
    </>
  );
}
