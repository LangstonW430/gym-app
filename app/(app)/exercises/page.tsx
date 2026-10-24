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
  const exercises = useQuery(api.exercises.list, {});
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
