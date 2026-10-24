"use client";

import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Empty, Page, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { dateKey } from "@/convex/lib/shared";
import { fmtDate, fmtMinutes, fmtVolume } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { useMountTime } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export default function HistoryPage() {
  const { units } = useSettings();
  const now = useMountTime();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const [selected, setSelected] = useState<string | null>(null);
  const range = useMemo(() => {
    const d = new Date(month);
    return { from: month, to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1 };
  }, [month]);
  const workouts = useQuery(api.workouts.list, range);

  const byDay = new Map<string, number>();
  for (const w of workouts ?? []) byDay.set(dateKey(w.startedAt), (byDay.get(dateKey(w.startedAt)) ?? 0) + 1);

  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const todayKey = dateKey(now);
  const shown = (workouts ?? []).filter((w) => !selected || dateKey(w.startedAt) === selected);

  const shift = (n: number) => {
    const d = new Date(month);
    setMonth(new Date(d.getFullYear(), d.getMonth() + n, 1).getTime());
    setSelected(null);
  };

  return (
    <>
      <PageHeader title="History" />
      <Page>
        <Card>
          <CardContent className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <button className="grid size-11 place-items-center rounded-lg hover:bg-muted" onClick={() => shift(-1)} aria-label="Previous month">
                <ChevronLeft className="size-5" />
              </button>
              <p className="font-semibold">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
              <button className="grid size-11 place-items-center rounded-lg hover:bg-muted" onClick={() => shift(1)} aria-label="Next month">
                <ChevronRight className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i} className="py-1">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {Array.from({ length: lead }).map((_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length: days }).map((_, i) => {
                const key = dateKey(new Date(first.getFullYear(), first.getMonth(), i + 1));
                const count = byDay.get(key) ?? 0;
                return (
                  <button
                    key={key}
                    disabled={!count}
                    onClick={() => setSelected(selected === key ? null : key)}
                    className={cn(
                      "num mx-auto flex size-11 flex-col items-center justify-center rounded-full text-sm",
                      key === todayKey && "font-semibold text-primary",
                      selected === key && "bg-primary text-primary-foreground",
                    )}
                  >
                    {i + 1}
                    <span className={cn("mt-0.5 size-1.5 rounded-full", count ? (selected === key ? "bg-primary-foreground" : "bg-success") : "bg-transparent")} />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          {workouts === undefined ? "Loading…" : `${workouts.length} workout${workouts.length === 1 ? "" : "s"} this month`}
          {selected && " · filtered to one day"}
        </p>

        {workouts && shown.length === 0 && <Empty>No workouts {selected ? "that day" : "this month"}.</Empty>}
        <ul className="flex flex-col gap-2">
          {shown.map((w) => (
            <li key={w._id}>
              <Link href={`/history/${w._id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{w.name}</p>
                      <p className="num text-sm text-muted-foreground">
                        {fmtDate(w.startedAt)} · {w.summary.durationSec ? fmtMinutes(w.summary.durationSec) : "—"} · {w.summary.workingSets} sets ·{" "}
                        {fmtVolume(w.summary.volumeKg, units)}
                      </p>
                    </div>
                    {w.summary.prs.length > 0 && (
                      <Badge>
                        <Trophy /> {w.summary.prs.length}
                      </Badge>
                    )}
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </Page>
    </>
  );
}
