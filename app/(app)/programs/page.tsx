"use client";

import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Empty, Page, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";

const TEMPLATES = [
  { name: "Push / Pull / Legs", routines: ["Push", "Pull", "Legs"], schedule: ["train", "train", "train", "rest", "train", "train", "rest"] },
  { name: "Upper / Lower", routines: ["Upper", "Lower"], schedule: ["train", "train", "rest", "train", "train", "rest", "rest"] },
  { name: "Full Body", routines: ["Full Body A", "Full Body B"], schedule: ["train", "rest", "train", "rest", "train", "rest", "rest"] },
] as const;

export default function ProgramsPage() {
  const programs = useQuery(api.programs.list);
  const create = useMutation(api.programs.create);
  const createRoutine = useMutation(api.routines.create);
  const router = useRouter();

  async function fromTemplate(t: (typeof TEMPLATES)[number] | null) {
    const name = t?.name ?? window.prompt("Program name", "My program");
    if (!name) return;
    const id = await create({ name, schedule: t ? [...t.schedule] : undefined });
    if (t) for (const r of t.routines) await createRoutine({ name: r, programId: id });
    router.push(`/programs/${id}`);
  }

  return (
    <>
      <PageHeader title="Programs" back="/" />
      <Page>
        {programs?.length === 0 && <Empty>No programs yet. Start from a template or a blank program.</Empty>}
        <ul className="flex flex-col gap-2">
          {programs?.map((p) => (
            <li key={p._id}>
              <Link href={`/programs/${p._id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-muted-foreground">{p.routineOrder.length} routines</p>
                    </div>
                    {p.isActive && (
                      <span className="flex items-center gap-1 text-xs font-medium text-success">
                        <CheckCircle2 className="size-4" /> Active
                      </span>
                    )}
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <p className="font-semibold">New program</p>
            {TEMPLATES.map((t) => (
              <Button key={t.name} variant="secondary" className="justify-start" onClick={() => fromTemplate(t)}>
                <Plus /> {t.name}
              </Button>
            ))}
            <Button variant="outline" className="justify-start" onClick={() => fromTemplate(null)}>
              <Plus /> Blank program
            </Button>
            <p className="text-xs text-muted-foreground">Templates create empty routines in order — add exercises to each, or ask Claude to fill them in.</p>
          </CardContent>
        </Card>
        <Link href="/exercises" className="text-center text-sm text-primary">
          Browse exercise library →
        </Link>
      </Page>
    </>
  );
}
