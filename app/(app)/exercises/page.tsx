"use client";

import { useQuery } from "convex/react";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateExerciseForm, ExerciseFilters, useExerciseFilter } from "@/components/exercise-picker";
import { Page, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { titleCase } from "@/lib/format";

export default function ExerciseLibraryPage() {
  const [showArchived, setShowArchived] = useState(false);
  const exercises = useQuery(api.exercises.list, { includeArchived: showArchived });
  const f = useExerciseFilter(exercises);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Exercise library"
        subtitle={exercises ? `${f.filtered.length} of ${exercises.length}` : undefined}
        back="/programs"
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> Custom
          </Button>
        }
      />
      <Page>
        <ExerciseFilters f={f} />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <Card>
          <ul className="divide-y">
            {f.filtered.map((e) => (
              <li key={e._id}>
                <Link href={`/progress/${e._id}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {titleCase(e.primaryMuscle)}
                      {e.secondaryMuscles.length ? ` (+${e.secondaryMuscles.map(titleCase).join(", ")})` : ""} · {titleCase(e.equipment)}
                      {e.isCustom ? " · Custom" : ""}
                      {e.archived ? " · Archived" : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </Page>
      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent title="Custom exercise">
          <CreateExerciseForm initialName={f.q} onDone={() => setCreating(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
