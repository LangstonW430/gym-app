"use client";

import {
  Check,
  Disc3,
  History,
  Link2,
  Minus,
  MoreVertical,
  NotebookPen,
  Plus,
  Repeat,
  Timer,
  Trash2,
  Trophy,
} from "lucide-react";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/input";
import { fromDisplay, SET_TYPES, toDisplay, type SetType, type Units } from "@/convex/lib/shared";
import { blankSet, editWorkout, type LocalExercise, type LocalSet } from "@/lib/active-workout";
import { fmtDuration, fmtNum, SET_TYPE_LABEL } from "@/lib/format";
import { haptic } from "@/lib/hooks";
import { incrementKgFor } from "@/lib/start-workout";
import { cn } from "@/lib/utils";

/** Numeric input that lets you type freely and commits parsed numbers. */
export function NumberField({
  value,
  onCommit,
  placeholder,
  className,
  decimal = true,
  onFocus,
  label,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  placeholder?: string;
  className?: string;
  decimal?: boolean;
  onFocus?: () => void;
  label: string;
}) {
  const [text, setText] = useState(value == null ? "" : fmtNum(value, 2));
  const [seen, setSeen] = useState(value);
  // External changes (steppers, sync) win; typing only commits on blur.
  if (value !== seen) {
    setSeen(value);
    setText(value == null ? "" : fmtNum(value, 2));
  }
  return (
    <input
      aria-label={label}
      inputMode={decimal ? "decimal" : "numeric"}
      enterKeyHint="done"
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        e.currentTarget.select();
        onFocus?.();
      }}
      onBlur={() => {
        const n = text.trim() === "" ? null : Number(text.replace(",", "."));
        onCommit(n === null || Number.isNaN(n) ? null : n);
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        "num h-12 w-full min-w-0 rounded-lg border border-input bg-background text-center text-lg font-medium outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/30",
        className,
      )}
    />
  );
}

function updateSet(clientId: string, patch: Partial<LocalSet>) {
  editWorkout((w) => ({ ...w, sets: w.sets.map((s) => (s.clientId === clientId ? { ...s, ...patch } : s)) }));
}

function updateExercise(key: string, patch: Partial<LocalExercise>) {
  editWorkout((w) => ({ ...w, exercises: w.exercises.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));
}

export function ExerciseCard({
  ex,
  sets,
  units,
  supersetLabel,
  onCompleteSet,
  onSwap,
  onHistory,
  onPlates,
}: {
  ex: LocalExercise;
  sets: LocalSet[];
  units: Units;
  supersetLabel?: string;
  onCompleteSet: (ex: LocalExercise, set: LocalSet) => void;
  onSwap: () => void;
  onHistory: () => void;
  onPlates: (weightDisplay: number) => void;
}) {
  const [active, setActive] = useState<{ id: string; field: "weight" | "reps" } | null>(null);
  const [notesOpen, setNotesOpen] = useState(!!ex.notes);
  const last = ex.last?.sets ?? [];
  const stepKg = incrementKgFor(ex, units);
  const doneCount = sets.filter((s) => s.completedAt).length;
  let workingIdx = 0;

  return (
    <section
      className={cn(
        "rounded-xl border bg-card",
        supersetLabel && "border-l-4 border-l-primary",
      )}
    >
      <header className="flex items-start gap-2 p-3 pb-1">
        <button className="min-w-0 flex-1 text-left" onClick={onHistory}>
          {supersetLabel && (
            <span className="mb-0.5 flex items-center gap-1 text-xs font-medium text-primary">
              <Link2 className="size-3" /> Superset {supersetLabel}
            </span>
          )}
          <h3 className="truncate text-base font-semibold text-primary">{ex.name}</h3>
          <p className="num text-xs text-muted-foreground">
            {ex.repMin ? `${ex.repMin === ex.repMax ? ex.repMin : `${ex.repMin}–${ex.repMax}`} reps · ` : ""}
            rest {fmtDuration(ex.restSec)} · {doneCount}/{sets.length} done
          </p>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="grid size-11 place-items-center rounded-lg hover:bg-muted" aria-label="Exercise menu">
            <MoreVertical className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onHistory}>
              <History /> History
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSwap}>
              <Repeat /> Swap exercise
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setNotesOpen(true)}>
              <NotebookPen /> Notes
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const v = window.prompt("Rest time (seconds)", String(ex.restSec));
                if (v && !Number.isNaN(Number(v))) updateExercise(ex.key, { restSec: Math.max(0, Number(v)) });
              }}
            >
              <Timer /> Rest time
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const v = window.prompt("Superset group letter (empty to clear)", ex.supersetGroup ?? "A");
                if (v !== null) updateExercise(ex.key, { supersetGroup: v.trim().toUpperCase() || undefined });
              }}
            >
              <Link2 /> Superset…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => {
                if (!window.confirm(`Remove ${ex.name} from this workout?`)) return;
                editWorkout((w) => ({
                  ...w,
                  exercises: w.exercises.filter((e) => e.key !== ex.key),
                  sets: w.sets.filter((s) => s.exerciseKey !== ex.key),
                }));
              }}
            >
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {sets.some((s) => s.progressed && !s.completedAt) && (
        <p className="px-3 pb-1 text-xs text-primary">
          Hit {ex.repMax} reps on every set last time — weight up {fmtNum(units === "kg" ? ex.incrementKg : ex.incrementLb)} {units}.
        </p>
      )}
      {notesOpen && (
        <div className="px-3 pb-2">
          <Textarea
            defaultValue={ex.notes}
            placeholder="Notes for this exercise (seat height, cues…)"
            className="min-h-14 text-sm"
            onBlur={(e) => updateExercise(ex.key, { notes: e.target.value })}
          />
        </div>
      )}

      <div className="grid grid-cols-[2.25rem_1fr_4.75rem_3.75rem_2.75rem_3rem] items-center gap-1.5 px-3 pt-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="text-center">Set</span>
        <span>Last</span>
        <span className="text-center">{ex.isBodyweight ? `+${units}` : units}</span>
        <span className="text-center">Reps</span>
        <span className="text-center">RIR</span>
        <span />
      </div>

      <ul className="flex flex-col pb-1">
        {sets.map((s, i) => {
          const l = last[i];
          const label = s.setType === "working" ? String(++workingIdx) : SET_TYPE_LABEL[s.setType];
          const done = !!s.completedAt;
          const isActive = active?.id === s.clientId;
          const wDisp = s.weight == null ? null : toDisplay(s.weight, units);
          return (
            <li key={s.clientId} className={cn("px-3 py-1 transition-colors", done && "bg-success-soft")}>
              <div className="grid grid-cols-[2.25rem_1fr_4.75rem_3.75rem_2.75rem_3rem] items-center gap-1.5">
                <SetTypeMenu
                  label={label}
                  type={s.setType}
                  onType={(t) => updateSet(s.clientId, { setType: t })}
                  onRemove={() => editWorkout((w) => ({ ...w, sets: w.sets.filter((x) => x.clientId !== s.clientId) }))}
                />
                <span className="num truncate text-sm text-muted-foreground/80">
                  {l ? `${fmtNum(toDisplay(l.weight, units))}×${l.reps}` : "—"}
                </span>
                <NumberField
                  label={`${ex.name} set ${label} weight`}
                  value={wDisp}
                  placeholder={l ? fmtNum(toDisplay(l.weight, units)) : "0"}
                  onFocus={() => setActive({ id: s.clientId, field: "weight" })}
                  onCommit={(v) => updateSet(s.clientId, { weight: v == null ? null : fromDisplay(v, units) })}
                  // Weight raised by double progression: shown in the accent colour.
                  className={s.progressed && !done ? "text-primary" : undefined}
                />
                <NumberField
                  label={`${ex.name} set ${label} reps`}
                  value={s.reps}
                  decimal={false}
                  placeholder={l ? String(l.reps) : String(ex.repMin ?? 0)}
                  onFocus={() => setActive({ id: s.clientId, field: "reps" })}
                  onCommit={(v) => updateSet(s.clientId, { reps: v == null ? null : Math.max(0, Math.round(v)) })}
                />
                <NumberField
                  label={`${ex.name} set ${label} reps in reserve`}
                  value={s.rir ?? null}
                  decimal={false}
                  placeholder="–"
                  className="text-base"
                  onCommit={(v) => updateSet(s.clientId, { rir: v == null ? undefined : Math.max(0, Math.min(10, Math.round(v))) })}
                />
                <button
                  aria-label={done ? "Mark set not done" : "Complete set"}
                  aria-pressed={done}
                  onClick={() => {
                    if (done) updateSet(s.clientId, { completedAt: undefined });
                    else onCompleteSet(ex, s);
                  }}
                  className={cn(
                    "relative grid h-12 w-12 place-items-center rounded-lg border-2 transition-colors",
                    done ? "border-success bg-success text-white" : "border-input text-muted-foreground",
                  )}
                >
                  <Check className="size-6" strokeWidth={3} />
                  {s.prs?.length ? (
                    <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground" title={`PR: ${s.prs.join(", ")}`}>
                      <Trophy className="size-3" />
                    </span>
                  ) : null}
                </button>
              </div>
              {isActive && (
                <StepperBar
                  field={active!.field}
                  units={units}
                  isBarbell={ex.equipment === "barbell"}
                  onStep={(dir) => {
                    haptic(8);
                    if (active!.field === "weight") {
                      const base = s.weight ?? (l ? l.weight : 0);
                      const next = Math.max(0, base + dir * stepKg);
                      // Snap to the increment grid in display units.
                      const disp = Math.round(toDisplay(next, units) / (units === "kg" ? ex.incrementKg : ex.incrementLb)) * (units === "kg" ? ex.incrementKg : ex.incrementLb);
                      updateSet(s.clientId, { weight: fromDisplay(disp, units) });
                    } else {
                      const base = s.reps ?? l?.reps ?? 0;
                      updateSet(s.clientId, { reps: Math.max(0, base + dir) });
                    }
                  }}
                  stepLabel={active!.field === "weight" ? fmtNum(units === "kg" ? ex.incrementKg : ex.incrementLb) : "1"}
                  onPlates={() => onPlates(wDisp ?? (l ? toDisplay(l.weight, units) : 0))}
                  onClose={() => setActive(null)}
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2 p-3 pt-1">
        <button
          className="flex h-11 flex-1 items-center justify-center gap-1 rounded-lg bg-secondary text-sm font-medium"
          onClick={() => {
            const prev = sets[sets.length - 1];
            editWorkout((w) => {
              const idx = w.sets.findLastIndex((x) => x.exerciseKey === ex.key);
              const ns = blankSet(ex.key, prev ? { setType: prev.setType === "warmup" ? "working" : prev.setType, weight: prev.weight, reps: prev.reps } : undefined);
              const next = [...w.sets];
              next.splice(idx + 1, 0, ns);
              return { ...w, sets: next };
            });
          }}
        >
          <Plus className="size-4" /> Add set
        </button>
      </div>
    </section>
  );
}

function SetTypeMenu({
  label,
  type,
  onType,
  onRemove,
}: {
  label: string;
  type: SetType;
  onType: (t: SetType) => void;
  onRemove: () => void;
}) {
  const names: Record<SetType, string> = { warmup: "Warm-up", working: "Working", drop: "Drop set", failure: "Failure" };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "num grid h-12 w-9 place-items-center rounded-lg text-sm font-semibold",
          type === "warmup" && "text-amber-500",
          type === "drop" && "text-violet-400",
          type === "failure" && "text-destructive",
        )}
        aria-label={`Set ${label}, ${names[type]}. Change type`}
      >
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {SET_TYPES.map((t) => (
          <DropdownMenuItem key={t} onSelect={() => onType(t)}>
            <span className="w-4 font-semibold">{SET_TYPE_LABEL[t] || "#"}</span> {names[t]}
            {t === type && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={onRemove}>
          <Trash2 /> Remove set
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StepperBar({
  field,
  units,
  stepLabel,
  isBarbell,
  onStep,
  onPlates,
  onClose,
}: {
  field: "weight" | "reps";
  units: Units;
  stepLabel: string;
  isBarbell: boolean;
  onStep: (dir: 1 | -1) => void;
  onPlates: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2" onPointerDown={(e) => e.preventDefault() /* keep input focus */}>
      <button className="num flex h-12 flex-1 items-center justify-center gap-1 rounded-lg bg-secondary text-base font-semibold" onClick={() => onStep(-1)}>
        <Minus className="size-4" /> {stepLabel}
        {field === "weight" ? ` ${units}` : ""}
      </button>
      <button className="num flex h-12 flex-1 items-center justify-center gap-1 rounded-lg bg-secondary text-base font-semibold" onClick={() => onStep(1)}>
        <Plus className="size-4" /> {stepLabel}
        {field === "weight" ? ` ${units}` : ""}
      </button>
      {field === "weight" && isBarbell && (
        <button className="grid h-12 w-12 place-items-center rounded-lg bg-secondary" onClick={onPlates} aria-label="Plate calculator">
          <Disc3 className="size-5" />
        </button>
      )}
      <button className="h-12 rounded-lg px-3 text-sm text-muted-foreground" onClick={onClose}>
        Done
      </button>
    </div>
  );
}
