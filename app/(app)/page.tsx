"use client";

import { useQuery } from "convex/react";
import { ChevronRight, Clock, Dumbbell, ListChecks, Play, Trophy } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { StartRoutineButton } from "@/components/start-routine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, Page, Section } from "@/components/page-header";
import { api } from "@/convex/_generated/api";
import { dateKey } from "@/convex/lib/shared";
import { useLocalWorkout } from "@/lib/active-workout";
import { fmtMinutes, fmtRelativeDay, fmtVolume, fmtW } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { useMountTime } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function HomePage() {
  const { units } = useSettings();
  const local = useLocalWorkout();
  // Fixed at mount so the query doesn't resubscribe every render.
  const now = useMountTime();
  const args = useMemo(() => ({ now, tzOffsetMin: new Date(now).getTimezoneOffset() }), [now]);
  const home = useQuery(api.stats.home, args);

  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Page>
      <header className="flex items-center justify-between pt-safe">
        <div>
          <p className="text-sm text-muted-foreground">{greeting}</p>
          <h1 className="text-2xl font-semibold">Let&apos;s train</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/programs">
            <ListChecks /> Programs
          </Link>
        </Button>
      </header>

      {local ? (
        <Card className="border-success/40 bg-success-soft">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-success">In progress</p>
              <p className="text-lg font-semibold">{local.name}</p>
              <p className="text-sm text-muted-foreground">
                {local.sets.filter((s) => s.completedAt).length} of {local.sets.length} sets done
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/workout">
                <Play /> Resume
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : home === undefined ? (
        <Card className="h-40 animate-pulse" />
      ) : home.next ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Next up · {home.next.programName}</p>
              <p className="text-2xl font-semibold">{home.next.name}</p>
              <p className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Dumbbell className="size-4" /> {home.next.exerciseCount} exercises
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-4" /> ~{home.next.estimatedMinutes} min
                </span>
              </p>
            </div>
            <StartRoutineButton routineId={home.next.routineId} size="lg" className="w-full text-base">
              <Play /> Start {home.next.name}
            </StartRoutineButton>
            <Link href="/workout" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
              Pick a different routine or start empty
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <p className="font-semibold">No program yet</p>
            <p className="text-sm text-muted-foreground">
              Build a program (e.g. Push / Pull / Legs) and the home screen will always show what&apos;s next — or ask Claude to write one.
            </p>
            <div className="flex gap-2">
              <Button asChild className="flex-1">
                <Link href="/programs">Create program</Link>
              </Button>
              <Button asChild variant="secondary" className="flex-1">
                <Link href="/workout">Start empty</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {home && <WeekStrip weekStart={home.weekStart} done={home.weekDays} schedule={home.next?.schedule} now={now} />}

      <Section title="Last workout">
        {home === undefined ? null : home.lastWorkout ? (
          <Link href={`/history/${home.lastWorkout._id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{home.lastWorkout.name}</p>
                  <p className="num text-sm text-muted-foreground">
                    {fmtRelativeDay(home.lastWorkout.startedAt)}
                    {home.lastWorkout.summary.durationSec ? ` · ${fmtMinutes(home.lastWorkout.summary.durationSec)}` : ""} ·{" "}
                    {home.lastWorkout.summary.workingSets} sets · {fmtVolume(home.lastWorkout.summary.volumeKg, units)}
                  </p>
                </div>
                {home.lastWorkout.summary.prs.length > 0 && (
                  <Badge>
                    <Trophy /> {home.lastWorkout.summary.prs.length}
                  </Badge>
                )}
                <ChevronRight className="size-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Empty>Your finished workouts show up here.</Empty>
        )}
      </Section>

      <Section title="PRs this week">
        {home && home.recentPrs.length > 0 ? (
          <Card>
            <ul className="divide-y">
              {home.recentPrs.slice(0, 8).map((p) => (
                <li key={p._id}>
                  <Link href={`/progress/${p.exerciseId}`} className="flex items-center gap-3 px-4 py-3">
                    <Trophy className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.exercise}</span>
                    <span className="num text-sm text-muted-foreground">
                      {p.kind === "e1rm" ? `e1RM ${fmtW(p.value, units)}` : `${fmtW(p.weight, units)} × ${p.reps}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          home && <Empty>No new records in the last 7 days — yet.</Empty>
        )}
      </Section>
    </Page>
  );
}

function WeekStrip({ weekStart, done, schedule, now }: { weekStart: number; done: number[]; schedule?: ("train" | "rest")[]; now: number }) {
  const doneKeys = new Set(done.map((t) => dateKey(t)));
  const today = dateKey(now);
  return (
    <Card>
      <CardContent className="grid grid-cols-7 gap-1 p-3">
        {DAYS.map((d, i) => {
          const ts = new Date(weekStart);
          ts.setDate(ts.getDate() + i);
          const key = dateKey(ts);
          const isDone = doneKeys.has(key);
          const isRest = !isDone && schedule?.[i] === "rest";
          const isToday = key === today;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className={cn("text-[11px] text-muted-foreground", isToday && "font-semibold text-foreground")}>{d}</span>
              <span
                className={cn(
                  "num grid size-9 place-items-center rounded-full text-xs",
                  isDone && "bg-success text-white",
                  isRest && "text-muted-foreground",
                  !isDone && !isRest && "border",
                  isToday && !isDone && "border-primary text-primary",
                )}
                title={isDone ? "Done" : isRest ? "Rest" : "Upcoming"}
              >
                {isDone ? "✓" : isRest ? "–" : ts.getDate()}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
