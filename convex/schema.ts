import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// All weights are stored in kilograms and converted on display, so switching
// units never rewrites history.

export const units = v.union(v.literal("lb"), v.literal("kg"));
export const equipment = v.union(
  v.literal("barbell"),
  v.literal("dumbbell"),
  v.literal("cable"),
  v.literal("machine"),
  v.literal("bodyweight"),
  v.literal("kettlebell"),
  v.literal("band"),
  v.literal("other"),
);
export const setType = v.union(
  v.literal("warmup"),
  v.literal("working"),
  v.literal("drop"),
  v.literal("failure"),
);
export const prKind = v.union(
  v.literal("weight"),
  v.literal("e1rm"),
  v.literal("reps"),
);

const plateSet = v.object({ bar: v.number(), plates: v.array(v.number()) });

export const workoutExercise = v.object({
  // Stable slot id inside a workout; survives swapping the exercise.
  key: v.string(),
  exerciseId: v.id("exercises"),
  notes: v.optional(v.string()),
  supersetGroup: v.optional(v.string()),
  restSec: v.optional(v.number()),
  repMin: v.optional(v.number()),
  repMax: v.optional(v.number()),
});

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // App settings
    units: v.optional(units),
    defaultRestSec: v.optional(v.number()),
    plateInventory: v.optional(v.object({ lb: plateSet, kg: plateSet })),
    pinnedExerciseIds: v.optional(v.array(v.id("exercises"))),
    seededAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  // Seeded exercises are copied per user on first sign-in (isCustom: false) so
  // each user can tune rest time and increments without a separate overrides table.
  exercises: defineTable({
    userId: v.id("users"),
    name: v.string(),
    primaryMuscle: v.string(),
    secondaryMuscles: v.array(v.string()),
    equipment,
    incrementLb: v.number(),
    incrementKg: v.number(),
    defaultRestSec: v.number(),
    isBodyweight: v.boolean(),
    isCustom: v.boolean(),
    archived: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "name"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["userId", "primaryMuscle", "equipment"],
    }),

  programs: defineTable({
    userId: v.id("users"),
    name: v.string(),
    routineOrder: v.array(v.id("routines")),
    // Monday-first, 7 entries.
    schedule: v.array(v.union(v.literal("train"), v.literal("rest"))),
    isActive: v.boolean(),
    archived: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  routines: defineTable({
    userId: v.id("users"),
    programId: v.optional(v.id("programs")),
    name: v.string(),
    notes: v.optional(v.string()),
    archived: v.boolean(),
    // Set when an edit (e.g. from Claude) archived this version and created a new one.
    supersededBy: v.optional(v.id("routines")),
  })
    .index("by_program", ["programId"])
    .index("by_user", ["userId"]),

  routineExercises: defineTable({
    routineId: v.id("routines"),
    exerciseId: v.id("exercises"),
    order: v.number(),
    targetSets: v.number(),
    repMin: v.number(),
    repMax: v.number(),
    restSec: v.optional(v.number()),
    supersetGroup: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_routine", ["routineId", "order"]),

  workouts: defineTable({
    userId: v.id("users"),
    // Client-generated id so a workout started offline can be synced idempotently.
    clientId: v.string(),
    routineId: v.optional(v.id("routines")),
    name: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("done")),
    notes: v.optional(v.string()),
    exercises: v.array(workoutExercise),
    updatedAt: v.number(),
    source: v.optional(v.string()),
  })
    .index("by_user_started", ["userId", "startedAt"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_client", ["userId", "clientId"]),

  workoutSets: defineTable({
    userId: v.id("users"),
    workoutId: v.id("workouts"),
    exerciseId: v.id("exercises"),
    exerciseKey: v.string(),
    clientId: v.string(),
    order: v.number(),
    setType,
    weight: v.number(),
    reps: v.number(),
    rir: v.optional(v.number()),
    // Undefined while the set is still pending in an active workout.
    completedAt: v.optional(v.number()),
    // PR kinds this set set at the time it was performed.
    prs: v.optional(v.array(prKind)),
  })
    .index("by_workout", ["workoutId", "order"])
    .index("by_user_exercise_time", ["userId", "exerciseId", "completedAt"])
    .index("by_user_time", ["userId", "completedAt"]),

  personalRecords: defineTable({
    userId: v.id("users"),
    exerciseId: v.id("exercises"),
    kind: prKind,
    value: v.number(),
    // For kind "reps": the weight the rep record was set at.
    weight: v.optional(v.number()),
    previousValue: v.optional(v.number()),
    setId: v.id("workoutSets"),
    workoutId: v.id("workouts"),
    achievedAt: v.number(),
  })
    .index("by_user_exercise", ["userId", "exerciseId"])
    .index("by_user_achieved", ["userId", "achievedAt"]),

  bodyweight: defineTable({
    userId: v.id("users"),
    // YYYY-MM-DD in the user's local time.
    date: v.string(),
    weight: v.number(),
  }).index("by_user_date", ["userId", "date"]),

  mcpTokens: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    label: v.string(),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_user", ["userId"]),
});
