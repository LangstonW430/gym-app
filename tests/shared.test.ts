import { describe, expect, test } from "vitest";
import { e1rm, fromDisplay, platesPerSide, suggestNext, toDisplay } from "@/convex/lib/shared";
import { parseWorkoutCsv } from "@/lib/import-export";

describe("double progression", () => {
  const inc = 2.5;
  test("adds an increment and resets reps when every working set hits the top", () => {
    const last = [
      { setType: "warmup" as const, weight: 40, reps: 10 },
      { setType: "working" as const, weight: 100, reps: 8 },
      { setType: "working" as const, weight: 100, reps: 8 },
    ];
    expect(suggestNext(last, 5, 8, inc)).toEqual([
      { weight: 40, reps: 10, progressed: false },
      { weight: 102.5, reps: 5, progressed: true },
      { weight: 102.5, reps: 5, progressed: true },
    ]);
  });
  test("repeats last time when any working set missed the top", () => {
    const last = [
      { setType: "working" as const, weight: 100, reps: 8 },
      { setType: "working" as const, weight: 100, reps: 7 },
    ];
    expect(suggestNext(last, 5, 8, inc).map((s) => [s.weight, s.reps, s.progressed])).toEqual([
      [100, 8, false],
      [100, 7, false],
    ]);
  });
});

describe("math", () => {
  test("Epley e1RM", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 2);
    expect(e1rm(0, 5)).toBe(0);
  });
  test("plates per side", () => {
    expect(platesPerSide(225, 45, [45, 35, 25, 10, 5, 2.5])).toEqual({ plates: [45, 45], remainder: 0 });
    expect(platesPerSide(185, 45, [45, 35, 25, 10, 5, 2.5])).toEqual({ plates: [45, 25], remainder: 0 });
    expect(platesPerSide(46, 45, [45, 2.5]).remainder).toBe(1);
  });
  test("unit round-trip never drifts", () => {
    for (const lb of [45, 135, 225, 227.5, 405]) expect(toDisplay(fromDisplay(lb, "lb"), "lb")).toBe(lb);
    for (const kg of [20, 62.5, 100, 142.5]) expect(toDisplay(fromDisplay(kg, "kg"), "kg")).toBe(kg);
  });
});

describe("import", () => {
  test("Hevy CSV", () => {
    const csv = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_lbs","reps","distance_miles","duration_seconds","rpe"
"Push","15 Oct 2024, 18:30","15 Oct 2024, 19:35","","Bench Press (Barbell)","","","0","warmup","95","10","","",""
"Push","15 Oct 2024, 18:30","15 Oct 2024, 19:35","","Bench Press (Barbell)","","","1","normal","185","5","","","8"
"Push","15 Oct 2024, 18:30","15 Oct 2024, 19:35","","Treadmill","","","0","normal","","","1.2","600",""`;
    const { format, workouts } = parseWorkoutCsv(csv, "kg");
    expect(format).toBe("hevy");
    expect(workouts).toHaveLength(1);
    expect(workouts[0].endedAt - workouts[0].startedAt).toBe(65 * 60_000);
    expect(workouts[0].sets).toHaveLength(2); // cardio row skipped
    expect(workouts[0].sets[0].setType).toBe("warmup");
    expect(toDisplay(workouts[0].sets[1].weight, "lb")).toBe(185);
    expect(workouts[0].sets[1].rir).toBe(2);
  });
  test("Strong CSV (semicolon-delimited)", () => {
    const csv = `Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE
2024-10-15 18:30:00;Legs;1h 5m;Squat (Barbell);W;60;5;;;;;
2024-10-15 18:30:00;Legs;1h 5m;Squat (Barbell);1;140;5;;;;;
2024-10-17 18:30:00;Upper;45m;Bench Press (Barbell);1;100;8;;;;;`;
    const { format, workouts } = parseWorkoutCsv(csv, "kg");
    expect(format).toBe("strong");
    expect(workouts.map((w) => w.name)).toEqual(["Legs", "Upper"]);
    expect(workouts[0].sets.map((s) => s.setType)).toEqual(["warmup", "working"]);
    expect(workouts[0].sets[1].weight).toBe(140);
  });
});
