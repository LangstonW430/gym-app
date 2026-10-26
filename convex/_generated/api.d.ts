/* eslint-disable */
  /**
   * Generated `api` utility.
   *
   * THIS CODE IS AUTOMATICALLY GENERATED.
   *
   * To regenerate, run `npx convex dev`.
   * @module
   */
  
  import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
  import type * as auth from "../auth.js";
import type * as bodyweight from "../bodyweight.js";
import type * as data from "../data.js";
import type * as exercises from "../exercises.js";
import type * as http from "../http.js";
import type * as lib_core from "../lib/core.js";
import type * as lib_seedExercises from "../lib/seedExercises.js";
import type * as lib_shared from "../lib/shared.js";
import type * as mcp from "../mcp.js";
import type * as programs from "../programs.js";
import type * as push from "../push.js";
import type * as pushNode from "../pushNode.js";
import type * as routines from "../routines.js";
import type * as stats from "../stats.js";
import type * as users from "../users.js";
import type * as workouts from "../workouts.js";

  /**
   * A utility for referencing Convex functions in your app's API.
   *
   * Usage:
   * ```js
   * const myFunctionReference = api.myModule.myFunction;
   * ```
   */
  declare const fullApi: ApiFromModules<{
    "auth": typeof auth,
"bodyweight": typeof bodyweight,
"data": typeof data,
"exercises": typeof exercises,
"http": typeof http,
"lib/core": typeof lib_core,
"lib/seedExercises": typeof lib_seedExercises,
"lib/shared": typeof lib_shared,
"mcp": typeof mcp,
"programs": typeof programs,
"push": typeof push,
"pushNode": typeof pushNode,
"routines": typeof routines,
"stats": typeof stats,
"users": typeof users,
"workouts": typeof workouts,
  }>;
  export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
  export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
export declare const components: {};
  