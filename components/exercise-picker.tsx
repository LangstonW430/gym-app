"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { EQUIPMENT, MUSCLES, type Equipment } from "@/convex/lib/shared";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export function useExerciseFilter(exercises: Doc<"exercises">[] | undefined) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (exercises ?? []).filter(
      (e) =>
        terms.every((t) => e.name.toLowerCase().includes(t)) &&
        (!muscle || e.primaryMuscle === muscle || e.secondaryMuscles.includes(muscle)) &&
        (!equipment || e.equipment === equipment),
    );
  }, [exercises, q, muscle, equipment]);
  return { q, setQ, muscle, setMuscle, equipment, setEquipment, filtered };
}

export function ExerciseFilters({ f }: { f: ReturnType<typeof useExerciseFilter> }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={f.q} onChange={(e) => f.setQ(e.target.value)} placeholder="Search exercises" className="pl-9" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect value={f.muscle} onChange={(e) => f.setMuscle(e.target.value)} aria-label="Muscle">
          <option value="">All muscles</option>
          {MUSCLES.map((m) => (
            <option key={m} value={m}>
              {titleCase(m)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={f.equipment} onChange={(e) => f.setEquipment(e.target.value)} aria-label="Equipment">
          <option value="">All equipment</option>
          {EQUIPMENT.map((m) => (
            <option key={m} value={m}>
              {titleCase(m)}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

export function ExercisePicker({
  open,
  onOpenChange,
  onPick,
  title = "Add exercise",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (e: Doc<"exercises">) => void;
  title?: string;
}) {
  const exercises = useQuery(api.exercises.list, open ? {} : "skip");
  const f = useExerciseFilter(exercises);
  const [creating, setCreating] = useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={title} className="sm:max-h-[80dvh]">
        {creating ? (
          <CreateExerciseForm
            initialName={f.q}
            onDone={(e) => {
              setCreating(false);
              if (e) onPick(e);
            }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <ExerciseFilters f={f} />
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus /> Custom exercise{f.q ? ` "${f.q}"` : ""}
            </Button>
            {exercises === undefined ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Loading library… (needs a connection)</p>
            ) : (
              <ul className="-mx-4 divide-y border-y">
                {f.filtered.map((e) => (
                  <li key={e._id}>
                    <button
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted"
                      onClick={() => onPick(e)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{e.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {titleCase(e.primaryMuscle)} · {titleCase(e.equipment)}
                          {e.isCustom ? " · Custom" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {f.filtered.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No matches</li>}
              </ul>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function CreateExerciseForm({
  initialName = "",
  onDone,
}: {
  initialName?: string;
  onDone: (e: Doc<"exercises"> | null) => void;
}) {
  const create = useMutation(api.exercises.create);
  const [name, setName] = useState(initialName);
  const [primaryMuscle, setPrimary] = useState<string>("chest");
  const [equipment, setEquipment] = useState<Equipment>("barbell");
  const [secondary, setSecondary] = useState<string[]>([]);
  const [rest, setRest] = useState(90);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          onDone(await create({ name, primaryMuscle, secondaryMuscles: secondary, equipment, defaultRestSec: rest }));
        } catch (err) {
          setError(err instanceof Error ? err.message.replace(/^.*ConvexError: /, "").split("\n")[0] : "Failed");
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ex-name">Name</Label>
        <Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label>Primary muscle</Label>
          <NativeSelect value={primaryMuscle} onChange={(e) => setPrimary(e.target.value)}>
            {MUSCLES.map((m) => (
              <option key={m} value={m}>
                {titleCase(m)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Equipment</Label>
          <NativeSelect value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {EQUIPMENT.map((m) => (
              <option key={m} value={m}>
                {titleCase(m)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Secondary muscles</Label>
        <div className="flex flex-wrap gap-1.5">
          {MUSCLES.filter((m) => m !== primaryMuscle).map((m) => {
            const on = secondary.includes(m);
            return (
              <button
                type="button"
                key={m}
                onClick={() => setSecondary(on ? secondary.filter((x) => x !== m) : [...secondary, m])}
                className={cn("min-h-9 rounded-full border px-3 text-xs", on && "border-primary bg-primary/15 text-primary")}
              >
                {titleCase(m)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ex-rest">Default rest (seconds)</Label>
        <Input id="ex-rest" type="number" inputMode="numeric" value={rest} onChange={(e) => setRest(Number(e.target.value))} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1">
          Create
        </Button>
      </div>
    </form>
  );
}
