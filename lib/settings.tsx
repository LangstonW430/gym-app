"use client";

import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { DEFAULT_PLATES, type Units } from "@/convex/lib/shared";
import { readJSON, writeJSON } from "./storage";

export interface Settings {
  units: Units;
  defaultRestSec: number;
  plateInventory: typeof DEFAULT_PLATES;
  pinnedExerciseIds: string[];
  name?: string;
  email?: string;
}

const KEY = "gym.settings.v1";
const FALLBACK: Settings = {
  units: "lb",
  defaultRestSec: 120,
  plateInventory: DEFAULT_PLATES,
  pinnedExerciseIds: [],
};

/** Server settings, cached locally so the workout screen works offline. */
export function useSettings(): Settings {
  const me = useQuery(api.users.me);
  useEffect(() => {
    if (me) writeJSON(KEY, me);
  }, [me]);
  if (me) return me as Settings;
  return readJSON<Settings>(KEY) ?? FALLBACK;
}
