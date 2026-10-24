"use client";

import { useMutation, useQuery } from "convex/react";
import { Pin, PinOff, Trophy } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { BodyHeatMap, heatFromExercise, HeatLegend } from "@/components/body-map";
import { TimeLineChart } from "@/components/charts/charts";
import { Empty, Page, PageHeader, Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { NumberField } from "@/components/workout/exercise-card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toDisplay } from "@/convex/lib/shared";
import { fmtDate, fmtNum, fmtVolume, fmtW, titleCase } from "@/lib/format";
import { useMountTime } from "@/lib/hooks";
import { useSettings } from "@/lib/settings";

type Metric = "e1rm" | "top" | "volume";
type Range = "1M" | "3M" | "1Y" | "All";
const RANGE_DAYS: Record<Range, number> = { "1M": 30, "3M": 91, "1Y": 365, All: Infinity };

export default function ExerciseProgressPage() {
  const { exerciseId } = useParams<{ exerciseId: Id<"exercises"> }>();
  const { units, pinnedExerciseIds } = useSettings();
  const data = useQuery(api.exercises.history, { exerciseId });
  const updateSettings = useMutation(api.users.updateSettings);
  const [metric, setMetric] = useState<Metric>("e1rm");
  const [range, setRange] = useState<Range>("All");

  const now = useMountTime();
  const sessions = useMemo(
    () => (data?.sessions ?? []).filter((s) => now - s.date <= RANGE_DAYS[range] * 86_400_000),
    [data, range, now],
  );
  if (data === undefined) return <PageHeader title="Exercise" back="/progress" />;
  const { exercise, records } = data;

  const series = sessions
    .map((s) => ({
      x: s.date,
      y: metric === "e1rm" ? s.e1rm : metric === "top" ? (s.topSet?.weight ?? 0) : s.volume,
    }))
    .filter((p) => p.y > 0);
  const fmt = (v: number) => (metric === "volume" ? fmtVolume(v, units) : fmtW(v, units));

  const bestWeight = records.find((r) => r.kind === "weight");
  const bestE1rm = records.find((r) => r.kind === "e1rm");
  const repRecords = records
    .filter((r) => r.kind === "reps" && (r.weight ?? 0) > 0)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 12);
  const isPinned = pinnedExerciseIds.includes(exerciseId);

  return (
    <>
      <PageHeader
        title={exercise.name}
        subtitle={`${titleCase(exercise.primaryMuscle)} · ${titleCase(exercise.equipment)}`}
        back="/progress"
        action={
          <Button
            variant="ghost"
            size="icon"
            aria-label={isPinned ? "Unpin" : "Pin to Progress"}
            onClick={() =>
              updateSettings({
                pinnedExerciseIds: isPinned
                  ? (pinnedExerciseIds.filter((x) => x !== exerciseId) as Id<"exercises">[])
                  : ([...pinnedExerciseIds, exerciseId] as Id<"exercises">[]),
              })
            }
          >
            {isPinned ? <PinOff /> : <Pin />}
          </Button>
        }
      />
      <Page>
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Best e1RM</p>
              <p className="num text-xl font-semibold">{bestE1rm ? fmtW(bestE1rm.value, units) : "—"}</p>
              {bestE1rm && <p className="text-xs text-muted-foreground">{fmtDate(bestE1rm.achievedAt)}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Heaviest set</p>
              <p className="num text-xl font-semibold">{bestWeight ? fmtW(bestWeight.value, units) : "—"}</p>
              {bestWeight && <p className="text-xs text-muted-foreground">{fmtDate(bestWeight.achievedAt)}</p>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <BodyHeatMap heat={heatFromExercise(exercise)} className="w-40 shrink-0" title={`${exercise.name}: muscles worked`} />
            <div className="flex flex-col gap-2 text-sm">
              <p>
                <span className="font-medium">Primary:</span> {titleCase(exercise.primaryMuscle)}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Secondary:</span>{" "}
                {exercise.secondaryMuscles.length ? exercise.secondaryMuscles.map(titleCase).join(", ") : "—"}
              </p>
              <HeatLegend scale="exercise" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-3">
            <Segmented
              value={metric}
              onChange={setMetric}
              options={[
                { value: "e1rm", label: "e1RM" },
                { value: "top", label: "Top set" },
                { value: "volume", label: "Volume" },
              ]}
            />
            {series.length >= 2 ? (
              <TimeLineChart data={series} format={fmt} name={metric === "e1rm" ? "Estimated 1RM" : metric === "top" ? "Heaviest set" : "Session volume"} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {series.length === 1 ? "One session so far — the graph starts at two." : "No sessions in this range."}
              </p>
            )}
            <Segmented
              value={range}
              onChange={setRange}
              options={(["1M", "3M", "1Y", "All"] as Range[]).map((r) => ({ value: r, label: r }))}
            />
            <p className="text-xs text-muted-foreground">e1RM uses the Epley formula on working sets (warm-ups excluded).</p>
          </CardContent>
        </Card>

        <Section title="Best reps at each weight">
          {repRecords.length ? (
            <Card>
              <table className="num w-full text-sm">
                <tbody className="divide-y">
                  {repRecords.map((r) => (
                    <tr key={r._id}>
                      <td className="px-4 py-2.5">{fmtW(r.weight!, units)}</td>
                      <td className="px-4 py-2.5 font-semibold">{r.value} reps</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtDate(r.achievedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <Empty>No working sets yet.</Empty>
          )}
        </Section>

        <Section title="Sessions">
          {sessions.length === 0 ? (
            <Empty>No sessions in this range.</Empty>
          ) : (
            <Card>
              <ul className="divide-y">
                {[...sessions].reverse().slice(0, 30).map((s) => (
                  <li key={s.workoutId} className="px-4 py-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{fmtDate(s.date)}</span>
                      <span className="num text-muted-foreground">e1RM {fmtW(s.e1rm, units)}</span>
                    </div>
                    <p className="num mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                      {s.sets.map((x) => (
                        <span key={x._id} className="inline-flex items-center gap-1">
                          {x.setType === "warmup" ? "W " : ""}
                          {fmtNum(toDisplay(x.weight, units))}×{x.reps}
                          {x.prs?.length ? <Trophy className="size-3 text-primary" /> : null}
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>

        <ExerciseSettings exercise={exercise} />
      </Page>
    </>
  );
}

function ExerciseSettings({
  exercise,
}: {
  exercise: { _id: Id<"exercises">; defaultRestSec: number; incrementLb: number; incrementKg: number; isBodyweight: boolean; name: string; isCustom: boolean };
}) {
  const update = useMutation(api.exercises.update);
  const [name, setName] = useState(exercise.name);
  return (
    <Section title="Exercise settings">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          {exercise.isCustom && (
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== exercise.name && update({ id: exercise._id, name: name.trim() })} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Rest (s)</Label>
              <NumberField label="Default rest seconds" decimal={false} value={exercise.defaultRestSec} onCommit={(v) => v != null && update({ id: exercise._id, defaultRestSec: v })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Step (lb)</Label>
              <NumberField label="Weight increment in pounds" value={exercise.incrementLb} onCommit={(v) => v && update({ id: exercise._id, incrementLb: v })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Step (kg)</Label>
              <NumberField label="Weight increment in kilograms" value={exercise.incrementKg} onCommit={(v) => v && update({ id: exercise._id, incrementKg: v })} />
            </div>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span>
              Bodyweight exercise
              <span className="block text-xs text-muted-foreground">Weight field logs added load (belt, vest).</span>
            </span>
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={exercise.isBodyweight}
              onChange={(e) => update({ id: exercise._id, isBodyweight: e.target.checked })}
            />
          </label>
        </CardContent>
      </Card>
    </Section>
  );
}
