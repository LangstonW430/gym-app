"use client";

import { useQuery } from "convex/react";
import { Trophy } from "lucide-react";
import Link from "next/link";
import { Sparkline } from "@/components/charts/sparkline";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmtDate, fmtW } from "@/lib/format";
import { useSettings } from "@/lib/settings";

/** Last 5 sessions + e1RM sparkline, without leaving the workout. */
export function ExerciseHistorySheet({
  exerciseId,
  name,
  open,
  onOpenChange,
}: {
  exerciseId: Id<"exercises">;
  name: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { units } = useSettings();
  const data = useQuery(api.exercises.history, open ? { exerciseId, limit: 12 } : "skip");
  const sessions = data?.sessions ?? [];
  const best = data?.records.find((r) => r.kind === "e1rm");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={name} description={best ? `Best e1RM ${fmtW(best.value, units)}` : undefined}>
        {data === undefined ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading… (needs a connection)</p>
        ) : sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No history for this exercise yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Sparkline data={sessions.map((s) => ({ x: s.date, y: s.e1rm }))} format={(y) => fmtW(y, units)} />
            <ul className="flex flex-col gap-3">
              {sessions
                .slice(-5)
                .reverse()
                .map((s) => (
                  <li key={s.workoutId} className="rounded-xl border p-3">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{fmtDate(s.date)}</span>
                      <span className="num text-muted-foreground">e1RM {fmtW(s.e1rm, units)}</span>
                    </div>
                    <div className="num flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      {s.sets.map((x) => (
                        <span key={x._id} className="inline-flex items-center gap-1">
                          {x.setType === "warmup" ? "W " : ""}
                          {fmtW(x.weight, units, false)}×{x.reps}
                          {x.prs?.length ? <Trophy className="size-3 text-primary" /> : null}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
            </ul>
            <Link href={`/progress/${exerciseId}`} className="text-center text-sm text-primary">
              Full progress →
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
