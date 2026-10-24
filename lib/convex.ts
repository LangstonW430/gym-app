import { ConvexReactClient } from "convex/react";

export const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

export const convex = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;
