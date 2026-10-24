"use client";

import { useMutation, useQuery } from "convex/react";
import { Archive, Copy, Link2, Plus, Trash2, Unlink } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BodyHeatMap, heatFromScores, HeatLegend, scoresFromPlan } from "@/components/body-map";
import { ExercisePicker } from "@/components/exercise-picker";
import { Page, PageHeader } from "@/components/page-header";
import { SortableList } from "@/components/sortable-list";
import { StartRoutineButton } from "@/components/start-routine";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { NumberField } from "@/components/workout/exercise-card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { estimateMinutes, uid } from "@/convex/lib/shared";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  exerciseId: Id<"exercises">;
  name: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  restSec?: number;
  defaultRest: number;
  supersetGroup?: string;
  notes?: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export default function RoutineEditorPage() {
  const { id } = useParams<{ id: Id<"routines"> }>();
  const routine = useQuery(api.routines.get, { id });
  const save = useMutation(api.routines.save);
  const duplicate = useMutation(api.routines.duplicate);
  const archive = useMutation(api.routines.archive);
  const router = useRouter();
  const { defaultRestSec } = useSettings();

  const [items, setItems] = useState<Item[] | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load once from the server; afterwards the local draft wins until saved.
  if (routine && items === null) {
    setName(routine.name);
    setNotes(routine.notes ?? "");
    setItems(
      routine.items
        .filter((it) => it.exercise)
        .map((it) => ({
          id: it._id,
          exerciseId: it.exerciseId,
          name: it.exercise!.name,
          targetSets: it.targetSets,
          repMin: it.repMin,
          repMax: it.repMax,
          restSec: it.restSec,
          defaultRest: it.exercise!.defaultRestSec,
          supersetGroup: it.supersetGroup,
          notes: it.notes,
          primaryMuscle: it.exercise!.primaryMuscle,
          secondaryMuscles: it.exercise!.secondaryMuscles,
        })),
    );
  }

  if (!routine || !items) return <PageHeader title="Routine" back={routine?.programId ? `/programs/${routine.programId}` : "/programs"} />;

  const change = (next: Item[]) => {
    setItems(next);
    setDirty(true);
  };
  const patch = (iid: string, p: Partial<Item>) => change(items.map((x) => (x.id === iid ? { ...x, ...p } : x)));

  function toggleSuperset(i: number) {
    const a = items![i];
    const b = items![i + 1];
    if (!b) return;
    if (a.supersetGroup && a.supersetGroup === b.supersetGroup) {
      // Unlink b (and anything after it in the same group).
      const g = a.supersetGroup;
      change(items!.map((x, j) => (j > i && x.supersetGroup === g ? { ...x, supersetGroup: undefined } : x)));
      return;
    }
    const used = new Set(items!.map((x) => x.supersetGroup).filter(Boolean));
    const g = a.supersetGroup ?? [...LETTERS].find((l) => !used.has(l))!;
    change(items!.map((x, j) => (j === i || j === i + 1 ? { ...x, supersetGroup: g } : x)));
  }

  async function doSave() {
    setSaving(true);
    try {
      await save({
        id,
        name,
        notes,
        exercises: items!.map((x) => ({
          exerciseId: x.exerciseId,
          targetSets: x.targetSets,
          repMin: x.repMin,
          repMax: Math.max(x.repMin, x.repMax),
          restSec: x.restSec,
          supersetGroup: x.supersetGroup,
          notes: x.notes || undefined,
        })),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  const minutes = estimateMinutes(items.map((x) => ({ targetSets: x.targetSets, restSec: x.restSec ?? x.defaultRest })), defaultRestSec);

  return (
    <>
      <PageHeader
        title={name || "Routine"}
        subtitle={`${items.length} exercises · ~${minutes} min`}
        back={routine.programId ? `/programs/${routine.programId}` : "/programs"}
        action={
          <Button size="sm" disabled={!dirty || saving} onClick={doSave}>
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        }
      />
      <Page>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="text-lg font-semibold"
          aria-label="Routine name"
        />

        <div className="flex flex-col gap-2">
          <SortableList
            items={items}
            getId={(x) => x.id}
            onReorder={change}
            render={(it, handle, i) => {
              const next = items[i + 1];
              const linked = !!it.supersetGroup && next?.supersetGroup === it.supersetGroup;
              const prevLinked = i > 0 && !!it.supersetGroup && items[i - 1].supersetGroup === it.supersetGroup;
              return (
                <div>
                  <Card className={cn(it.supersetGroup && "border-l-4 border-l-primary", prevLinked && "rounded-t-none", linked && "rounded-b-none")}>
                    <CardContent className="flex flex-col gap-2 p-2 pr-3">
                      <div className="flex items-center gap-1">
                        {handle}
                        <div className="min-w-0 flex-1">
                          {it.supersetGroup && <p className="text-xs font-medium text-primary">Superset {it.supersetGroup}</p>}
                          <p className="truncate font-semibold">{it.name}</p>
                        </div>
                        <button
                          className="grid size-11 place-items-center text-muted-foreground"
                          aria-label="Remove exercise"
                          onClick={() => change(items.filter((x) => x.id !== it.id))}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2 pl-2">
                        <Field label="Sets">
                          <NumberField label="Target sets" decimal={false} value={it.targetSets} onCommit={(v) => patch(it.id, { targetSets: Math.max(1, Math.min(20, v ?? 1)) })} />
                        </Field>
                        <Field label="Min reps">
                          <NumberField label="Minimum reps" decimal={false} value={it.repMin} onCommit={(v) => patch(it.id, { repMin: Math.max(1, v ?? 1) })} />
                        </Field>
                        <Field label="Max reps">
                          <NumberField label="Maximum reps" decimal={false} value={it.repMax} onCommit={(v) => patch(it.id, { repMax: Math.max(1, v ?? 1) })} />
                        </Field>
                        <Field label="Rest (s)">
                          <NumberField
                            label="Rest seconds"
                            decimal={false}
                            value={it.restSec ?? null}
                            placeholder={String(it.defaultRest)}
                            onCommit={(v) => patch(it.id, { restSec: v ?? undefined })}
                          />
                        </Field>
                      </div>
                      <Input
                        defaultValue={it.notes}
                        placeholder="Notes"
                        className="ml-2 h-10 w-[calc(100%-0.5rem)] text-sm"
                        onBlur={(e) => e.target.value !== (it.notes ?? "") && patch(it.id, { notes: e.target.value })}
                      />
                    </CardContent>
                  </Card>
                  {next && (
                    <button
                      onClick={() => toggleSuperset(i)}
                      className="mx-auto flex h-8 items-center gap-1 px-3 text-xs text-muted-foreground hover:text-primary"
                    >
                      {linked ? <Unlink className="size-3" /> : <Link2 className="size-3" />}
                      {linked ? "Unlink superset" : "Superset with next"}
                    </button>
                  )}
                </div>
              );
            }}
          />
        </div>

        <Button variant="outline" size="lg" onClick={() => setPicker(true)}>
          <Plus /> Add exercise
        </Button>

        {items.length > 0 && (
          <Card>
            <CardContent className="flex items-center gap-3 p-3">
              <BodyHeatMap
                heat={heatFromScores(scoresFromPlan(items.map((x) => ({ sets: x.targetSets, exercise: x }))), "workout")}
                className="w-36 shrink-0"
                title="Muscles this routine works"
              />
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">What this routine hits</p>
                <HeatLegend scale="workout" />
              </div>
            </CardContent>
          </Card>
        )}

        <Textarea
          value={notes}
          placeholder="Routine notes"
          onChange={(e) => {
            setNotes(e.target.value);
            setDirty(true);
          }}
        />

        {dirty ? (
          <Button size="lg" onClick={doSave} disabled={saving}>
            Save routine
          </Button>
        ) : (
          <StartRoutineButton routineId={id} size="lg" disabled={!items.length}>
            Start this routine
          </StartRoutineButton>
        )}

        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              const copy = await duplicate({ id });
              router.push(`/routines/${copy}`);
            }}
          >
            <Copy /> Duplicate
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              if (!window.confirm("Archive this routine? Past workouts keep their history.")) return;
              await archive({ id });
              router.replace(routine.programId ? `/programs/${routine.programId}` : "/programs");
            }}
          >
            <Archive /> Archive
          </Button>
        </div>
      </Page>

      <ExercisePicker
        open={picker}
        onOpenChange={setPicker}
        onPick={(e) => {
          setPicker(false);
          change([
            ...items,
            {
              id: uid(),
              exerciseId: e._id,
              name: e.name,
              targetSets: 3,
              repMin: 8,
              repMax: 12,
              defaultRest: e.defaultRestSec,
              primaryMuscle: e.primaryMuscle,
              secondaryMuscles: e.secondaryMuscles,
            },
          ]);
        }}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
