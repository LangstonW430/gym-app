"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { useLocalWorkout } from "@/lib/active-workout";
import { useSettings } from "@/lib/settings";
import { BottomNav } from "./bottom-nav";
import { SignIn } from "./sign-in";
import { WorkoutSync } from "./workout-sync";

export function AppShell({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const path = usePathname();
  const local = useLocalWorkout();
  const hideNav = path.startsWith("/workout") && !!local;

  // Offline cold start: auth can't confirm without the network, but a workout
  // in progress must still be usable from the local copy.
  const offlineWorkout = isLoading && !!local && path.startsWith("/workout");

  if (isLoading && !offlineWorkout) {
    return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!isAuthenticated && !offlineWorkout) return <SignIn />;

  return (
    <>
      <WorkoutSync />
      {isAuthenticated && <Bootstrap />}
      <div className={hideNav ? "min-h-dvh" : "min-h-dvh pb-24"}>{children}</div>
      {!hideNav && <BottomNav />}
    </>
  );
}

/** Seeds the exercise library on first sign-in and warms the settings cache. */
function Bootstrap() {
  const me = useQuery(api.users.me);
  const bootstrap = useMutation(api.users.bootstrap);
  useSettings();
  useEffect(() => {
    if (me && !me.seeded) void bootstrap();
  }, [me, bootstrap]);
  return null;
}
