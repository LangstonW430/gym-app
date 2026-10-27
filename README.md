# Gym Tracker

A personal lifting tracker: unlimited routines, all-time progress graphs, free
CSV/JSON export, and a Claude connector that can read your training and write
routines. Phone-first PWA on Next.js + Convex.

**First time? Follow [SETUP.md](./SETUP.md)** to connect Convex, Vercel, your phone, and Claude.

**Want the rest timer on your iPhone lock screen?** See [IOS.md](./IOS.md) for the free, no-Mac build of the native shell.

## What's in it

- **Workout logging** (`/workout`): last-time values in grey, double-progression
  pre-fill, big steppers, warm-up/working/drop/failure sets, RIR, PR badges the
  moment a set is saved, rest timer that survives the phone locking, swap/add/remove
  exercises and sets, supersets, plate calculator, exercise history sheet. The
  in-progress workout lives in localStorage and syncs when online.
- **Programs & routines**: drag to reorder, rep ranges, rest, supersets, duplicate,
  archive. "Next up" follows program order, not weekdays.
- **History**: month calendar, workout detail, edit or delete (app only).
- **Progress**: e1RM / top set / volume charts with 1M/3M/1Y/All, PRs, best reps
  at each weight, weekly sets per muscle vs the 10–20 band, workouts per week.
- **Bodyweight** with a 7-day moving average.
- **Data**: CSV + JSON export; Hevy / Strong CSV import.
- **Claude**: remote MCP server at `/api/mcp` with 8 read and 5 write tools, no
  deletes. Token auth managed in Profile.

## Layout

```
app/(app)/            screens (Home, Workout, History, Progress, Profile, Programs, …)
app/api/mcp/route.ts  MCP endpoint (stateless Streamable HTTP)
components/           UI (shadcn-style primitives in components/ui)
lib/active-workout.ts local-first workout store; components/workout-sync.tsx pushes it
lib/mcp-server.ts     MCP tool definitions
convex/               schema + functions; convex/mcp.ts is the connector's backend
convex/lib/shared.ts  math shared by client and server (e1RM, progression, plates, units)
```

Weights are stored in kg and converted for display, so switching units never
rewrites history. Sets are the source of truth; PRs are recomputed from them in the
same mutation that saves a set.

## Commands

```bash
npm run dev          # Next.js
npx convex dev       # Convex functions (keep running)
npm run typecheck && npm run lint && npm test
```
