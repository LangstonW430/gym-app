"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { getWorkout, patchLocal, setWorkout, toSnapshot, useLocalWorkout } from "@/lib/active-workout";

export type SyncStatus = "idle" | "pending" | "syncing" | "offline" | "error";
let lastStatus: SyncStatus = "idle";
const statusListeners = new Set<(s: SyncStatus) => void>();
function setStatus(s: SyncStatus) {
  lastStatus = s;
  statusListeners.forEach((l) => l(s));
}
export function useSyncStatus() {
  const [s, set] = useState<SyncStatus>(lastStatus);
  useEffect(() => {
    statusListeners.add(set);
    return () => void statusListeners.delete(set);
  }, []);
  return s;
}

/** Listeners for "this workout finished on the server" (navigate to summary). */
const finishedListeners = new Set<(id: string) => void>();
export function onWorkoutFinished(l: (id: string) => void) {
  finishedListeners.add(l);
  return () => void finishedListeners.delete(l);
}

/**
 * Pushes the local workout to Convex whenever it's dirty. Mounted once in the
 * app shell. Mutations issued while offline wait in the Convex client and are
 * retried; the persisted dirty flag covers app restarts.
 */
export function WorkoutSync() {
  const { isAuthenticated } = useConvexAuth();
  const sync = useMutation(api.workouts.sync);
  const finish = useMutation(api.workouts.finish);
  const w = useLocalWorkout();
  const inFlight = useRef(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);

  useEffect(() => {
    if (!w || (!w.dirty && !w.finishedAt)) {
      if (!inFlight.current) setStatus("idle");
      return;
    }
    if (!online) return setStatus("offline");
    if (!isAuthenticated) return setStatus("pending");
    setStatus("pending");
    const t = setTimeout(async () => {
      if (inFlight.current) return;
      const cur = getWorkout();
      if (!cur) return;
      inFlight.current = true;
      setStatus("syncing");
      try {
        const snap = toSnapshot(cur);
        if (cur.finishedAt) {
          const id = await finish({ snapshot: snap, endedAt: cur.finishedAt });
          if (getWorkout()?.clientId === cur.clientId) setWorkout(null);
          finishedListeners.forEach((l) => l(id));
        } else {
          const res = await sync({ snapshot: snap });
          patchLocal((x) =>
            x.clientId !== cur.clientId
              ? x
              : {
                  ...x,
                  serverId: res.workoutId,
                  dirty: x.updatedAt !== cur.updatedAt ? x.dirty : false,
                  sets: x.sets.map((s) => ({ ...s, prs: res.prs[s.clientId] })),
                },
          );
        }
        setStatus("idle");
      } catch (e) {
        console.error("Workout sync failed", e);
        setStatus("error");
        // Retry later by re-marking dirty after a pause.
        setTimeout(() => patchLocal((x) => ({ ...x })), 5000);
      } finally {
        inFlight.current = false;
      }
    }, syncDelay(w.finishedAt));
    return () => clearTimeout(t);
  }, [w, online, isAuthenticated, sync, finish]);

  return null;
}

function syncDelay(finishedAt?: number) {
  return finishedAt ? 0 : 700;
}
