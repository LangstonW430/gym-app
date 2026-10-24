"use client";

import { useQuery } from "convex/react";
import { CheckCircle2, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Page } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WEEKLY_SET_TARGET } from "@/convex/lib/shared";
import { fmtMinutes, fmtNum, fmtVolume, fmtW, titleCase } from "@/lib/format";
import { useSettings } from "@/lib/settings";

export default function SummaryPage() {
  const { id } = useParams<{ id: Id<"workouts"> }>();
  const { units } = useSettings();
  const data = useQuery(api.workouts.get, { id });
  if (!data) return <Page><p className="text-muted-foreground">Loading…</p></Page>;
  const s = data.summary;
  const muscles = Object.entries(s.musclesSets).sort((a, b) => b[1] - a[1]);

  return (
    <Page>
      <div className="flex flex-col items-center gap-2 pt-8 text-center">
        <CheckCircle2 className="size-14 text-success" />
        <h1 className="text-2xl font-semibold">Workout complete</h1>
        <p className="text-muted-foreground">{data.workout.name}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Duration" value={s.durationSec ? fmtMinutes(s.durationSec) : "—"} />
        <Stat label="Volume" value={fmtVolume(s.volumeKg, units)} />
        <Stat label="Sets" value={String(s.workingSets)} />
      </div>
      {s.prs.length > 0 && (
        <Card className="border-primary/40">
          <CardContent className="flex flex-col gap-2 p-4">
            <p className="flex items-center gap-2 font-semibold text-primary">
              <Trophy className="size-5" /> {s.prs.length} personal record{s.prs.length > 1 ? "s" : ""}
            </p>
            <ul className="num text-sm">
              {s.prs.map((p, i) => (
                <li key={i} className="flex justify-between py-1">
                  <span>{p.exercise}</span>
                  <span className="text-muted-foreground">
                    {fmtW(p.weight, units)} × {p.reps} · {p.kinds.map((k) => (k === "e1rm" ? "e1RM" : "weight")).join(" + ")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <p className="font-semibold">Sets per muscle</p>
          <ul className="flex flex-col gap-2">
            {muscles.map(([m, n]) => (
              <li key={m} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span className="truncate">{titleCase(m)}</span>
                <span className="h-2 rounded-full bg-muted">
                  <span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (n / WEEKLY_SET_TARGET.min) * 100)}%` }} />
                </span>
                <span className="num text-right text-muted-foreground">{fmtNum(n)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Primary muscle counts 1 set, each secondary 0.5. Bar fills at 10 (the weekly minimum).</p>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button asChild variant="secondary" className="flex-1">
          <Link href={`/history/${id}`}>View details</Link>
        </Button>
        <Button asChild className="flex-1">
          <Link href="/">Done</Link>
        </Button>
      </div>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className="num text-lg font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
