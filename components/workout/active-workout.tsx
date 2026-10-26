"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import { ChevronDown, CloudOff, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ExercisePicker } from "@/components/exercise-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { onWorkoutFinished, useSyncStatus } from "@/components/workout-sync";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  editWorkout,
  patchLocal,
  setWorkout,
  type LocalExercise,
  type LocalSet,
  type LocalWorkout,
} from "@/lib/active-workout";
import { fmtDuration, fmtNum } from "@/lib/format";
import { toDisplay } from "@/convex/lib/shared";
import { haptic, useNow } from "@/lib/hooks";
import { useSettings } from "@/lib/settings";
import { localExercise, prefillSets } from "@/lib/start-workout";
import { ExerciseCard } from "./exercise-card";
import { ExerciseHistorySheet } from "./exercise-history-sheet";
import { PlateCalculator } from "./plate-calculator";
import { RestTimer, startRest } from "./rest-timer";

export function ActiveWorkout({ w }: { w: LocalWorkout }) {
  const { units } = useSettings();
  const convex = useConvex();
  const router = useRouter();
  const discard = useMutation(api.workouts.discard);
  const now = useNow(1000);
  const status = useSyncStatus();

  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "swap"; key: string } | null>(null);
  const [historyFor, setHistoryFor] = useState<LocalExercise | null>(null);
  const [plates, setPlates] = useState<number | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);

  // When the sync loop completes the finish, show the summary.
  useEffect(() => onWorkoutFinished((id) => router.replace(`/workout/summary/${id}`)), [router]);

  // "Last time" is captured when the workout starts, but a workout resumed on
  // another device or started offline won't have it: fill gaps from a live query.
  const idKey = [...new Set(w.exercises.map((e) => e.exerciseId))].sort().join(",");
  const exerciseIds = useMemo(() => idKey.split(",").filter(Boolean) as Doc<"exercises">["_id"][], [idKey]);
  const liveLast = useQuery(api.workouts.lastSets, exerciseIds.length ? { exerciseIds, excludeWorkoutId: w.serverId } : "skip");
  useEffect(() => {
    if (!liveLast || !w.exercises.some((e) => !e.last && liveLast[e.exerciseId])) return;
    patchLocal((x) => ({
      ...x,
      exercises: x.exercises.map((e) => (!e.last && liveLast[e.exerciseId] ? { ...e, last: liveLast[e.exerciseId] } : e)),
    }));
  }, [liveLast, w.exercises]);

  async function fetchLast(exerciseId: Doc<"exercises">["_id"]) {
    try {
      const res = await convex.query(api.workouts.lastSets, { exerciseIds: [exerciseId] });
      return res[exerciseId] ?? null;
    } catch {
      return null;
    }
  }

  async function addExercise(doc: Doc<"exercises">) {
    setPicker(null);
    const ex = localExercise(doc, { last: await fetchLast(doc._id) });
    editWorkout((x) => ({
      ...x,
      exercises: [...x.exercises, ex],
      sets: [...x.sets, ...prefillSets(ex, Math.max(ex.last?.sets.length ?? 3, 1), units)],
    }));
  }

  async function swapExercise(key: string, doc: Doc<"exercises">) {
    setPicker(null);
    const last = await fetchLast(doc._id);
    editWorkout((x) => ({
      ...x,
      exercises: x.exercises.map((e) =>
        e.key === key
          ? { ...localExercise(doc, { repMin: e.repMin, repMax: e.repMax, supersetGroup: e.supersetGroup, last }), key }
          : e,
      ),
      // Keep the set count and reps; weights don't transfer between exercises.
      sets: x.sets.map((s, i, all) => {
        if (s.exerciseKey !== key) return s;
        const idx = all.filter((y) => y.exerciseKey === key).indexOf(s);
        const l = last?.sets[idx];
        return { ...s, weight: l ? l.weight : null, reps: s.reps ?? l?.reps ?? null, prs: undefined, completedAt: undefined };
      }),
    }));
  }

  function completeSet(ex: LocalExercise, set: LocalSet) {
    const l = ex.last?.sets[w.sets.filter((s) => s.exerciseKey === ex.key).indexOf(set)];
    const weight = set.weight ?? l?.weight ?? 0;
    const reps = set.reps ?? l?.reps ?? ex.repMin ?? 0;
    haptic(15);
    editWorkout((x) => {
      const sets = x.sets.map((s) => (s.clientId === set.clientId ? { ...s, weight, reps, completedAt: Date.now() } : s));
      // Carry values forward into the next empty set of this exercise.
      const mine = sets.filter((s) => s.exerciseKey === ex.key);
      const next = mine[mine.findIndex((s) => s.clientId === set.clientId) + 1];
      return {
        ...x,
        sets: sets.map((s) =>
          next && s.clientId === next.clientId && !s.completedAt
            ? { ...s, weight: s.weight ?? weight, reps: s.reps ?? reps }
            : s,
        ),
      };
    });
    // In a superset, rest only after the last exercise of the group.
    const group = ex.supersetGroup ? w.exercises.filter((e) => e.supersetGroup === ex.supersetGroup) : [ex];
    if (group[group.length - 1].key === ex.key) {
      const nextEx = w.exercises[w.exercises.findIndex((e) => e.key === ex.key) + 1];
      const hasMore = w.sets.some((s) => s.exerciseKey === ex.key && !s.completedAt && s.clientId !== set.clientId);
      const target = hasMore ? ex : nextEx ?? ex;
      const targetSets = w.sets.filter((s) => s.exerciseKey === target.key);
      const nextIdx = hasMore ? targetSets.findIndex((s) => s.clientId === set.clientId) + 1 : targetSets.findIndex((s) => !s.completedAt);
      const nextSet = targetSets[nextIdx];
      const nextLast = target.last?.sets[nextIdx];
      const planned = nextSet?.weight != null && nextSet.reps != null ? `${fmtNum(toDisplay(nextSet.weight, units))}×${nextSet.reps}` : null;
      const detail = [
        nextIdx >= 0 ? `Set ${nextIdx + 1} of ${targetSets.length}` : null,
        planned ? `planned ${planned}` : null,
        nextLast ? `last time ${fmtNum(toDisplay(nextLast.weight, units))}×${nextLast.reps}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      startRest(ex.restSec, hasMore ? (group.length > 1 ? `Superset ${ex.supersetGroup}` : ex.name) : nextEx?.name ?? ex.name, detail || undefined);
    }
  }

  const elapsed = Math.max(0, Math.floor((now - w.startedAt) / 1000));
  const done = w.sets.filter((s) => s.completedAt).length;

  // Superset labels follow group letters; contiguous grouping is shown by a left border.
  const groupCounts = w.exercises.reduce<Record<string, number>>((acc, e) => {
    if (e.supersetGroup) acc[e.supersetGroup] = (acc[e.supersetGroup] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-dvh pb-40">
      <header className="sticky top-0 z-30 border-b bg-background/95 pt-safe backdrop-blur">
        <div className="mx-auto flex h-16 max-w-lg items-center gap-2 px-2">
          <Link href="/" className="grid size-11 place-items-center rounded-lg hover:bg-muted" aria-label="Minimize workout">
            <ChevronDown className="size-6" />
          </Link>
          <div className="min-w-0 flex-1">
            <input
              aria-label="Workout name"
              defaultValue={w.name}
              onBlur={(e) => e.target.value.trim() && editWorkout((x) => ({ ...x, name: e.target.value.trim() }))}
              className="w-full truncate bg-transparent text-base font-semibold outline-none"
            />
            <p className="num flex items-center gap-2 text-sm text-muted-foreground">
              {fmtDuration(elapsed)} · {done}/{w.sets.length} sets
              <SyncBadge status={status} />
            </p>
          </div>
          <Button onClick={() => setFinishOpen(true)} className="bg-success text-white hover:bg-success/90">
            Finish
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col gap-3 p-3">
        {w.exercises.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Empty workout. Add your first exercise below.
          </p>
        )}
        {w.exercises.map((ex) => (
          <ExerciseCard
            key={ex.key}
            ex={ex}
            units={units}
            sets={w.sets.filter((s) => s.exerciseKey === ex.key)}
            supersetLabel={ex.supersetGroup && groupCounts[ex.supersetGroup] > 1 ? ex.supersetGroup : undefined}
            onCompleteSet={completeSet}
            onSwap={() => setPicker({ mode: "swap", key: ex.key })}
            onHistory={() => setHistoryFor(ex)}
            onPlates={(wt) => setPlates(wt)}
          />
        ))}

        <Button variant="outline" size="lg" onClick={() => setPicker({ mode: "add" })}>
          <Plus /> Add exercise
        </Button>

        <Textarea
          defaultValue={w.notes}
          placeholder="Workout notes"
          onBlur={(e) => editWorkout((x) => ({ ...x, notes: e.target.value }))}
        />

        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            if (!window.confirm("Discard this workout? Nothing from it will be saved.")) return;
            void discard({ clientId: w.clientId });
            setWorkout(null);
            router.replace("/");
          }}
        >
          <Trash2 /> Discard workout
        </Button>
      </main>

      <RestTimer />

      <ExercisePicker
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker?.mode === "swap" ? "Swap exercise" : "Add exercise"}
        onPick={(doc) => (picker?.mode === "swap" ? swapExercise(picker.key, doc) : addExercise(doc))}
      />
      {historyFor && (
        <ExerciseHistorySheet
          exerciseId={historyFor.exerciseId}
          name={historyFor.name}
          open={!!historyFor}
          onOpenChange={(o) => !o && setHistoryFor(null)}
        />
      )}
      <PlateCalculator open={plates !== null} onOpenChange={(o) => !o && setPlates(null)} weight={plates ?? 0} />

      <Sheet open={finishOpen} onOpenChange={setFinishOpen}>
        <SheetContent title="Finish workout?">
          <div className="flex flex-col gap-3">
            {w.sets.some((s) => !s.completedAt) && (
              <p className="text-sm text-muted-foreground">
                {w.sets.filter((s) => !s.completedAt).length} unchecked set(s) will be dropped.
              </p>
            )}
            {status === "offline" && (
              <p className="text-sm text-muted-foreground">
                You&apos;re offline. The workout is saved on this phone and will upload when you reconnect.
              </p>
            )}
            <Button
              size="lg"
              disabled={done === 0}
              className="bg-success text-white hover:bg-success/90"
              onClick={() => {
                editWorkout((x) => ({ ...x, finishedAt: Date.now(), rest: null }));
                setFinishOpen(false);
              }}
            >
              {done === 0 ? "Complete at least one set" : "Finish and save"}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setFinishOpen(false)}>
              Keep training
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {w.finishedAt && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/90 p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            {status === "offline" ? <CloudOff className="size-8" /> : <Loader2 className="size-8 animate-spin" />}
            <p className="font-medium">{status === "offline" ? "Saved offline — will upload when you're back online." : "Saving workout…"}</p>
            <Button variant="link" onClick={() => editWorkout((x) => ({ ...x, finishedAt: undefined }))}>
              Back to workout
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncBadge({ status }: { status: string }) {
  if (status === "offline") return <span className="inline-flex items-center gap-1 text-amber-500"><CloudOff className="size-3" /> offline</span>;
  if (status === "error") return <span className="text-destructive">sync error</span>;
  if (status === "syncing" || status === "pending") return <span className="text-muted-foreground/70">saving…</span>;
  return null;
}
