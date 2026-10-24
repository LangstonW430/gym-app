"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { Clock, Dumbbell, Play, Plus, Smartphone } from "lucide-react";
import { useEffect } from "react";
import { Page, PageHeader, Section } from "@/components/page-header";
import { useStartWorkout } from "@/components/start-routine";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActiveWorkout } from "@/components/workout/active-workout";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { getWorkout, setWorkout, useLocalWorkout, type LocalWorkout } from "@/lib/active-workout";
import { localExercise } from "@/lib/start-workout";

export default function WorkoutPage() {
  const local = useLocalWorkout();
  const { isAuthenticated } = useConvexAuth();
  const server = useQuery(api.workouts.active, isAuthenticated ? {} : "skip");
  const exercises = useQuery(api.exercises.list, isAuthenticated && server ? {} : "skip");

  // Cross-device: adopt the server copy when it's newer and we have no unsynced edits;
  // drop our copy if it was finished or discarded elsewhere.
  useEffect(() => {
    if (server === undefined) return;
    const cur = getWorkout();
    if (!cur || cur.dirty || cur.finishedAt) return;
    if (server === null || server.workout.clientId !== cur.clientId) {
      if (cur.serverId) setWorkout(null);
      return;
    }
    if (server.workout.updatedAt > cur.updatedAt && exercises) {
      setWorkout({ ...fromServer(server, exercises), rest: cur.rest });
    }
  }, [server, exercises]);

  if (local) return <ActiveWorkout w={local} />;
  return <StartScreen server={server ?? null} exercises={exercises} />;
}

function fromServer(
  server: { workout: Doc<"workouts">; sets: Doc<"workoutSets">[] },
  exercises: Doc<"exercises">[],
): LocalWorkout {
  const byId = new Map(exercises.map((e) => [e._id, e]));
  const w = server.workout;
  return {
    clientId: w.clientId,
    routineId: w.routineId,
    name: w.name,
    startedAt: w.startedAt,
    notes: w.notes,
    updatedAt: w.updatedAt,
    dirty: false,
    serverId: w._id,
    exercises: w.exercises
      .filter((e) => byId.has(e.exerciseId))
      .map((e) => ({
        ...localExercise(byId.get(e.exerciseId)!, {
          restSec: e.restSec,
          repMin: e.repMin,
          repMax: e.repMax,
          notes: e.notes,
          supersetGroup: e.supersetGroup,
        }),
        key: e.key,
      })),
    sets: server.sets.map((s) => ({
      clientId: s.clientId,
      exerciseKey: s.exerciseKey,
      setType: s.setType,
      weight: s.weight,
      reps: s.reps,
      rir: s.rir,
      completedAt: s.completedAt,
      prs: s.prs,
    })),
  };
}

function StartScreen({
  server,
  exercises,
}: {
  server: { workout: Doc<"workouts">; sets: Doc<"workoutSets">[] } | null;
  exercises: Doc<"exercises">[] | undefined;
}) {
  const program = useQuery(api.programs.active);
  const next = useQuery(api.programs.nextUp);
  const routines = useQuery(api.routines.list);
  const { startRoutine, startEmpty, busy } = useStartWorkout();
  const order = program?.routineOrder ?? [];
  const inProgram = (routines ?? []).filter((r) => order.includes(r._id)).sort((a, b) => order.indexOf(a._id) - order.indexOf(b._id));
  const others = (routines ?? []).filter((r) => !order.includes(r._id));

  return (
    <>
      <PageHeader title="Start workout" />
      <Page>
        {server && (
          <Card className="border-success/40 bg-success-soft">
            <CardContent className="flex items-center gap-3 p-4">
              <Smartphone className="size-6 text-success" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{server.workout.name} is in progress</p>
                <p className="text-sm text-muted-foreground">Started on another device</p>
              </div>
              <Button disabled={!exercises} onClick={() => exercises && setWorkout(fromServer(server, exercises))}>
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {next && (
          <Button size="lg" className="h-16 text-base" disabled={busy} onClick={() => startRoutine(next.routine._id)}>
            <Play /> Next up: {next.routine.name}
          </Button>
        )}
        <Button size="lg" variant="secondary" onClick={startEmpty}>
          <Plus /> Start empty workout
        </Button>

        {inProgram.length > 0 && (
          <Section title={program?.name ?? "Program"}>
            <RoutineList routines={inProgram} onStart={startRoutine} busy={busy} />
          </Section>
        )}
        {others.length > 0 && (
          <Section title="Other routines">
            <RoutineList routines={others} onStart={startRoutine} busy={busy} />
          </Section>
        )}
      </Page>
    </>
  );
}

function RoutineList({
  routines,
  onStart,
  busy,
}: {
  routines: Doc<"routines">[];
  onStart: (id: Doc<"routines">["_id"]) => void;
  busy: boolean;
}) {
  return (
    <Card>
      <ul className="divide-y">
        {routines.map((r) => (
          <li key={r._id}>
            <button disabled={busy} onClick={() => onStart(r._id)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-muted/50">
              <Dumbbell className="size-5 text-muted-foreground" />
              <span className="flex-1 font-medium">{r.name}</span>
              <Clock className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
