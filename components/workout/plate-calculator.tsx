"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { platesPerSide, type Units } from "@/convex/lib/shared";
import { fmtNum } from "@/lib/format";
import { useSettings } from "@/lib/settings";

const PLATE_COLORS: Record<number, string> = {
  45: "bg-blue-600", 25: "bg-red-600", 20: "bg-blue-600", 35: "bg-yellow-500", 15: "bg-yellow-500",
  10: "bg-green-600", 5: "bg-zinc-200", 2.5: "bg-zinc-400", 1.25: "bg-zinc-500",
};

export function PlateCalculator({
  open,
  onOpenChange,
  weight,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  weight: number; // display units
}) {
  const { units, plateInventory } = useSettings();
  const inv = plateInventory[units as Units];
  const { plates, remainder } = platesPerSide(weight, inv.bar, inv.plates);
  const counts = plates.reduce<Record<number, number>>((acc, p) => ({ ...acc, [p]: (acc[p] ?? 0) + 1 }), {});
  const maxPlate = Math.max(...inv.plates, 1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={`${fmtNum(weight)} ${units}`} description={`Plates per side on a ${inv.bar} ${units} bar`}>
        {weight <= inv.bar ? (
          <p className="py-6 text-center text-muted-foreground">Just the bar.</p>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex h-36 items-center justify-center gap-0.5" aria-hidden>
              <div className="h-3 w-10 rounded-l bg-zinc-400" />
              {plates.map((p, i) => (
                <div
                  key={i}
                  className={`w-4 rounded-sm border border-black/20 ${PLATE_COLORS[p] ?? "bg-zinc-500"}`}
                  style={{ height: `${30 + (p / maxPlate) * 70}%` }}
                />
              ))}
              <div className="h-3 w-6 rounded-r bg-zinc-400" />
            </div>
            <ul className="num divide-y rounded-xl border">
              {Object.entries(counts)
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([p, n]) => (
                  <li key={p} className="flex justify-between px-4 py-3">
                    <span>
                      {fmtNum(Number(p))} {units}
                    </span>
                    <span className="font-semibold">× {n}</span>
                  </li>
                ))}
            </ul>
            {remainder > 0 && (
              <p className="text-sm text-destructive">
                {fmtNum(remainder)} {units} can&apos;t be made with your plates.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Edit bar and plate inventory in Profile.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
