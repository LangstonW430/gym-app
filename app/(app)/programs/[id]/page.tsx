"use client";

import { useMutation, useQuery } from "convex/react";
import { Archive, CheckCircle2, ChevronRight, Clock, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Page, PageHeader, Section } from "@/components/page-header";
import { SortableList } from "@/components/sortable-list";
import { StartRoutineButton } from "@/components/start-routine";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ProgramPage() {
  const { id } = useParams<{ id: Id<"programs"> }>();
  const data = useQuery(api.programs.get, { id });
  const update = useMutation(api.programs.update).withOptimisticUpdate((store, args) => {
    const cur = store.getQuery(api.programs.get, { id });
    if (!cur || !args.routineOrder) return;
    const byId = new Map(cur.routines.map((r) => [r._id, r]));
    store.setQuery(api.programs.get, { id }, {
      ...cur,
      program: { ...cur.program, routineOrder: args.routineOrder },
      routines: args.routineOrder.map((r) => byId.get(r)!).filter(Boolean),
    });
  });
  const setActive = useMutation(api.programs.setActive);
  const archive = useMutation(api.programs.archive);
  const createRoutine = useMutation(api.routines.create);
  const router = useRouter();

  if (!data) return <PageHeader title="Program" back="/programs" />;
  const { program, routines, unused } = data;

  // Map each train day to the routine it would be in a fresh week (illustration only:
  // the real "next up" follows order, not weekday).
  let r = 0;
  const preview = program.schedule.map((d) => (d === "rest" || !routines.length ? null : routines[r++ % routines.length].name));

  return (
    <>
      <PageHeader
        title={program.name}
        back="/programs"
        action={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Rename program"
            onClick={() => {
              const name = window.prompt("Program name", program.name);
              if (name) void update({ id, name });
            }}
          >
            <Pencil />
          </Button>
        }
      />
      <Page>
        {program.isActive ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" /> Active program — Home suggests its next routine
          </p>
        ) : (
          <Button onClick={() => setActive({ id })}>Make active</Button>
        )}

        <Section title="Weekly schedule">
          <Card>
            <CardContent className="grid grid-cols-7 gap-1 p-3">
              {program.schedule.map((d, i) => (
                <button
                  key={i}
                  onClick={() => update({ id, schedule: program.schedule.map((x, j) => (j === i ? (x === "train" ? "rest" : "train") : x)) })}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs",
                    d === "train" ? "border-primary/50 bg-primary/10" : "text-muted-foreground",
                  )}
                  aria-label={`${DAY_NAMES[i]}: ${d}. Tap to toggle`}
                >
                  <span className="font-medium">{DAY_NAMES[i]}</span>
                  <span className="max-w-full truncate px-0.5 text-[10px]">{d === "rest" ? "Rest" : preview[i] ?? "Train"}</span>
                </button>
              ))}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Tap a day to toggle train/rest. Routines rotate in order, so a missed day pushes the sequence back instead of skipping a session.
          </p>
        </Section>

        <Section title="Routine order">
          <div className="flex flex-col gap-2">
            <SortableList
              items={routines}
              getId={(x) => x._id}
              onReorder={(next) => update({ id, routineOrder: next.map((x) => x._id) })}
              render={(routine, handle, i) => (
                <Card>
                  <CardContent className="flex items-center gap-1 p-2">
                    {handle}
                    <Link href={`/routines/${routine._id}`} className="min-w-0 flex-1 py-1">
                      <p className="font-semibold">
                        <span className="num mr-2 text-muted-foreground">{i + 1}</span>
                        {routine.name}
                      </p>
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        {routine.items.length} exercises <Clock className="size-3" /> ~{routine.estimatedMinutes} min
                      </p>
                    </Link>
                    <StartRoutineButton routineId={routine._id} size="sm" variant="secondary" disabled={!routine.items.length}>
                      Start
                    </StartRoutineButton>
                    <Link href={`/routines/${routine._id}`} className="grid size-11 place-items-center text-muted-foreground" aria-label="Edit routine">
                      <ChevronRight className="size-5" />
                    </Link>
                  </CardContent>
                </Card>
              )}
            />
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              const name = window.prompt("Routine name", "Upper");
              if (!name) return;
              const rid = await createRoutine({ name, programId: id });
              router.push(`/routines/${rid}`);
            }}
          >
            <Plus /> Add routine
          </Button>
        </Section>

        {unused.length > 0 && (
          <Section title="Not in rotation">
            <Card>
              <ul className="divide-y">
                {unused.map((u) => (
                  <li key={u._id} className="flex items-center gap-2 px-4 py-2">
                    <Link href={`/routines/${u._id}`} className="flex-1">
                      {u.name}
                    </Link>
                    <Button size="sm" variant="secondary" onClick={() => update({ id, routineOrder: [...program.routineOrder, u._id] })}>
                      Add to rotation
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        )}

        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={async () => {
            if (!window.confirm("Archive this program? Its routines and history stay.")) return;
            await archive({ id });
            router.replace("/programs");
          }}
        >
          <Archive /> Archive program
        </Button>
      </Page>
    </>
  );
}
