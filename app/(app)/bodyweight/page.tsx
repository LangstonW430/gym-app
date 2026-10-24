"use client";

import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { TimeLineChart } from "@/components/charts/charts";
import { Empty, Page, PageHeader, Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { api } from "@/convex/_generated/api";
import { dateKey, fromDisplay } from "@/convex/lib/shared";
import { fmtDate, fmtW } from "@/lib/format";
import { useMountTime } from "@/lib/hooks";
import { useSettings } from "@/lib/settings";

type Range = "1M" | "3M" | "1Y" | "All";
const DAYS: Record<Range, number> = { "1M": 30, "3M": 91, "1Y": 365, All: 100000 };
const parseDay = (d: string) => new Date(`${d}T12:00:00`).getTime();

export default function BodyweightPage() {
  const { units } = useSettings();
  const now = useMountTime();
  const rows = useQuery(api.bodyweight.list, {});
  const log = useMutation(api.bodyweight.log);
  const remove = useMutation(api.bodyweight.remove);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(() => dateKey(Date.now()));
  const [range, setRange] = useState<Range>("3M");

  // 7-day moving average over calendar days (entries within the trailing week).
  const series = useMemo(() => {
    const pts = (rows ?? []).map((r) => ({ x: parseDay(r.date), y: r.weight }));
    return pts.map((p) => {
      const win = pts.filter((q) => q.x <= p.x && p.x - q.x < 7 * 86_400_000);
      return { ...p, y2: win.reduce((a, q) => a + q.y, 0) / win.length };
    });
  }, [rows]);
  const cutoff = now - DAYS[range] * 86_400_000;
  const shown = series.filter((p) => p.x >= cutoff);
  const latest = series[series.length - 1];

  return (
    <>
      <PageHeader title="Bodyweight" back="/progress" />
      <Page>
        <Card>
          <CardContent className="p-3">
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const n = Number(value.replace(",", "."));
                if (!n) return;
                await log({ date, weight: fromDisplay(n, units) });
                setValue("");
              }}
            >
              <Input
                inputMode="decimal"
                placeholder={`Weight (${units})`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="num h-12 flex-1 text-lg"
                aria-label={`Bodyweight in ${units}`}
              />
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 w-36" aria-label="Date" />
              <Button type="submit" className="h-12">
                Log
              </Button>
            </form>
          </CardContent>
        </Card>

        {latest && (
          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Latest</p>
                <p className="num text-xl font-semibold">{fmtW(latest.y, units)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">7-day average</p>
                <p className="num text-xl font-semibold">{fmtW(latest.y2, units)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardContent className="flex flex-col gap-3 p-3">
            {shown.length >= 2 ? (
              <>
                <TimeLineChart data={shown} format={(v) => fmtW(v, units)} name="Daily" second={{ name: "7-day avg" }} />
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--series-1)]" /> Daily</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--series-2)]" /> 7-day average</span>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Log at least two days to see the trend.</p>
            )}
            <Segmented value={range} onChange={setRange} options={(["1M", "3M", "1Y", "All"] as Range[]).map((r) => ({ value: r, label: r }))} />
          </CardContent>
        </Card>

        <Section title="Entries">
          {rows && rows.length === 0 && <Empty>No entries yet.</Empty>}
          <Card>
            <ul className="divide-y">
              {[...(rows ?? [])].reverse().slice(0, 60).map((r) => (
                <li key={r._id} className="flex items-center justify-between px-4 py-2">
                  <span className="text-sm">{fmtDate(parseDay(r.date))}</span>
                  <span className="num flex items-center gap-2 font-medium">
                    {fmtW(r.weight, units)}
                    <button className="grid size-11 place-items-center text-muted-foreground" aria-label="Delete entry" onClick={() => remove({ id: r._id })}>
                      <Trash2 className="size-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      </Page>
    </>
  );
}
