"use client";

import { useConvex, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getWorkout, newWorkout, setWorkout } from "@/lib/active-workout";
import { useSettings } from "@/lib/settings";
import { workoutFromRoutine } from "@/lib/start-workout";

export function useStartWorkout() {
  const convex = useConvex();
  const router = useRouter();
  const { units } = useSettings();
  const [busy, setBusy] = useState(false);
  const discard = useMutation(api.workouts.discard);

  const confirmReplace = () => {
    const cur = getWorkout();
    if (!cur) return true;
    if (!window.confirm(`"${cur.name}" is still in progress. Discard it and start a new workout?`)) return false;
    void discard({ clientId: cur.clientId });
    return true;
  };

  async function startRoutine(routineId: Id<"routines">) {
    if (!confirmReplace()) return;
    setBusy(true);
    try {
      const routine = await convex.query(api.routines.get, { id: routineId });
      const last = await convex.query(api.workouts.lastSets, {
        exerciseIds: routine.items.map((i) => i.exerciseId),
      });
      setWorkout(workoutFromRoutine(routine, last, units));
      router.push("/workout");
    } finally {
      setBusy(false);
    }
  }

  function startEmpty() {
    if (!confirmReplace()) return;
    setWorkout(newWorkout({ name: "Workout", exercises: [], sets: [] }));
    router.push("/workout");
  }

  return { startRoutine, startEmpty, busy };
}

export function StartRoutineButton({
  routineId,
  children,
  ...props
}: { routineId: Id<"routines"> } & ComponentProps<typeof Button>) {
  const { startRoutine, busy } = useStartWorkout();
  return (
    <Button {...props} disabled={busy || props.disabled} onClick={() => startRoutine(routineId)}>
      {busy ? "Loading…" : children}
    </Button>
  );
}
