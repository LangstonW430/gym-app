"use client";

import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Trash2, Trophy, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BodyHeatMap, heatFromScores, HeatLegend } from "@/components/body-map";
import { Page, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { NumberField } from "@/components/workout/exercise-card";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { fromDisplay, SET_TYPES, toDisplay, uid, type SetType } from "@/convex/lib/shared";
import { fmtDate, fmtMinutes, fmtNum, fmtVolume, fmtW, SET_TYPE_LABEL } from "@/lib/format";
import { useSettings } from "@/lib/settings";

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: Id<"workouts"> }>();
  const data = useQuery(api.workouts.get, { id });
  const remove = useMutation(api.workouts.remove);
  const router = useRouter();
  const { units } = useSettings();
  const [editing, setEditing] = useState(false);

  if (data === undefined) return <PageHeader title="Workout" back="/history" />;
  const { workout, sets, exercises, summary } = data;
  const exById = new Map(exercises.map((e) => [e._id, e]));

  if (editing) return <EditWorkout data={data} onDone={() => setEditing(false)} />;

  return (
    <>
      <PageHeader
        title={workout.name}
        subtitle={fmtDate(workout.startedAt, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        back="/history"
        action={
          <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Edit workout">
            <Pencil />
          </Button>
        }
      />
      <Page>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Duration", summary.durationSec ? fmtMinutes(summary.durationSec) : "—"],
            ["Volume", fmtVolume(summary.volumeKg, units)],
            ["Sets", String(summary.workingSets)],
          ].map(([l, v]) => (
            <Card key={l}>
              <CardContent className="p-3">
                <p className="num font-semibold">{v}</p>
                <p className="text-xs text-muted-foreground">{l}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {workout.notes && <p className="rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap">{workout.notes}</p>}

        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <BodyHeatMap heat={heatFromScores(summary.musclesSets, "workout")} className="mx-auto w-full max-w-xs" />
            <HeatLegend scale="workout" className="justify-center" />
          </CardContent>
        </Card>

        {workout.exercises.map((slot) => {
          const ex = exById.get(slot.exerciseId);
          const mine = sets.filter((s) => s.exerciseKey === slot.key);
          if (!mine.length) return null;
          let n = 0;
          return (
            <Card key={slot.key}>
              <CardContent className="p-4">
                <p className="font-semibold">{ex?.name ?? "Exercise"}</p>
                {slot.notes && <p className="mb-1 text-sm text-muted-foreground">{slot.notes}</p>}
                <table className="num mt-2 w-full text-sm">
                  <tbody>
                    {mine.map((s) => (
                      <tr key={s._id} className="border-t first:border-t-0">
                        <td className="w-10 py-2 font-medium text-muted-foreground">{s.setType === "working" ? ++n : SET_TYPE_LABEL[s.setType]}</td>
                        <td className="py-2">
                          {fmtW(s.weight, units)} × {s.reps}
                        </td>
                        <td className="py-2 text-muted-foreground">{s.rir !== undefined ? `RIR ${s.rir}` : ""}</td>
                        <td className="py-2 text-right">
                          {s.prs?.length ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                              <Trophy className="size-3" /> {s.prs.map((k) => (k === "e1rm" ? "e1RM" : k)).join(" ")}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })}

        <Button
          variant="ghost"
          className="text-destructive"
          onClick={async () => {
            if (!window.confirm("Delete this workout permanently? PRs will be recalculated.")) return;
            await remove({ id });
            router.replace("/history");
          }}
        >
          <Trash2 /> Delete workout
        </Button>
      </Page>
    </>
  );
}

type EditSet = { clientId: string; exerciseKey: string; exerciseId: Id<"exercises">; setType: SetType; weight: number; reps: number; rir?: number; completedAt: number };

function toLocalInput(ts: number) {
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function EditWorkout({
  data,
  onDone,
}: {
  data: { workout: Doc<"workouts">; sets: Doc<"workoutSets">[]; exercises: Doc<"exercises">[] };
  onDone: () => void;
}) {
  const { units } = useSettings();
  const save = useMutation(api.workouts.saveEdit);
  const { workout } = data;
  const exById = new Map(data.exercises.map((e) => [e._id, e]));
  const [name, setName] = useState(workout.name);
  const [notes, setNotes] = useState(workout.notes ?? "");
  const [start, setStart] = useState(toLocalInput(workout.startedAt));
  const [end, setEnd] = useState(toLocalInput(workout.endedAt ?? workout.startedAt));
  const [sets, setSets] = useState<EditSet[]>(
    data.sets.map((s) => ({ ...s, completedAt: s.completedAt ?? workout.startedAt })),
  );
  const [error, setError] = useState<string | null>(null);
  const patch = (cid: string, p: Partial<EditSet>) => setSets((ss) => ss.map((s) => (s.clientId === cid ? { ...s, ...p } : s)));

  return (
    <>
      <PageHeader
        title="Edit workout"
        action={
          <Button variant="ghost" size="icon" onClick={onDone} aria-label="Cancel">
            <X />
          </Button>
        }
      />
      <Page>
        <div className="flex flex-col gap-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label>Started</Label>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Ended</Label>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {workout.exercises.map((slot) => {
          const mine = sets.filter((s) => s.exerciseKey === slot.key);
          return (
            <Card key={slot.key}>
              <CardContent className="flex flex-col gap-2 p-4">
                <p className="font-semibold">{exById.get(slot.exerciseId)?.name}</p>
                {mine.map((s) => (
                  <div key={s.clientId} className="grid grid-cols-[4.5rem_1fr_1fr_2.75rem] items-center gap-2">
                    <NativeSelect value={s.setType} onChange={(e) => patch(s.clientId, { setType: e.target.value as SetType })} className="px-1 text-sm">
                      {SET_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t === "working" ? "Work" : t === "warmup" ? "Warm" : t === "drop" ? "Drop" : "Fail"}
                        </option>
                      ))}
                    </NativeSelect>
                    <NumberField label="Weight" value={toDisplay(s.weight, units)} onCommit={(v) => patch(s.clientId, { weight: fromDisplay(v ?? 0, units) })} />
                    <NumberField label="Reps" decimal={false} value={s.reps} onCommit={(v) => patch(s.clientId, { reps: Math.round(v ?? 0) })} />
                    <button className="grid h-11 place-items-center text-destructive" aria-label="Remove set" onClick={() => setSets((ss) => ss.filter((x) => x.clientId !== s.clientId))}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const prev = mine[mine.length - 1];
                    setSets((ss) => [
                      ...ss,
                      {
                        clientId: uid(),
                        exerciseKey: slot.key,
                        exerciseId: slot.exerciseId,
                        setType: "working",
                        weight: prev?.weight ?? 0,
                        reps: prev?.reps ?? 0,
                        completedAt: (prev?.completedAt ?? workout.startedAt) + 1,
                      },
                    ]);
                  }}
                >
                  <Plus /> Add set
                </Button>
                <p className="num text-xs text-muted-foreground">Weights in {units}. {mine.length ? `Top: ${fmtNum(Math.max(...mine.map((m) => toDisplay(m.weight, units))))}` : ""}</p>
              </CardContent>
            </Card>
          );
        })}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          size="lg"
          onClick={async () => {
            try {
              const order = new Map(workout.exercises.map((e, i) => [e.key, i]));
              const sorted = [...sets].sort((a, b) => order.get(a.exerciseKey)! - order.get(b.exerciseKey)! || a.completedAt - b.completedAt);
              await save({
                id: workout._id,
                name: name.trim() || workout.name,
                notes: notes || undefined,
                startedAt: new Date(start).getTime(),
                endedAt: new Date(end).getTime(),
                exercises: workout.exercises,
                sets: sorted.map((s, i) => ({
                  clientId: s.clientId,
                  exerciseKey: s.exerciseKey,
                  exerciseId: s.exerciseId,
                  order: i,
                  setType: s.setType,
                  weight: s.weight,
                  reps: s.reps,
                  rir: s.rir,
                  completedAt: s.completedAt,
                })),
              });
              onDone();
            } catch (e) {
              setError(e instanceof Error ? e.message.split("\n")[0] : "Save failed");
            }
          }}
        >
          Save changes
        </Button>
      </Page>
    </>
  );
}
