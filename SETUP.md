# Setup: connecting everything

The code is complete; what's left is creating the accounts/deployments and wiring
their keys together. Roughly 20 minutes. Do the steps in order.

| Service | What it's for | Cost |
| --- | --- | --- |
| Convex | Database + backend functions + auth | Free tier is plenty |
| Vercel | Hosts the web app and `/api/mcp` | Free (Hobby) |
| claude.ai | Custom connector to `/api/mcp` | Your existing plan |

## 1. Run it locally

```bash
npm install
npx convex dev          # log in, "create a new project" → writes .env.local, starts syncing functions
```

Leave `npx convex dev` running. It also regenerates `convex/_generated/` (committed
here, generated offline; your run will refresh it — commit the result).

In a second terminal, set up Convex Auth keys on the dev deployment:

```bash
npx @convex-dev/auth    # sets JWT_PRIVATE_KEY, JWKS and SITE_URL on the dev deployment
                        # when asked for the site URL, use http://localhost:3000
```

Required — the app is locked to the emails listed here (nobody can sign in if it's unset):

```bash
npx convex env set ALLOWED_EMAILS you@example.com
```

Then:

```bash
npm run dev             # http://localhost:3000 → "Create an account"
```

On first sign-in the app copies the ~150-exercise library into your account.
Create a program from a template on Home → Programs, add exercises to each routine,
and start a workout.

## 2. Deploy the backend + web app (Vercel + Convex production)

1. Push this repo to GitHub (already done if you're reading this on the branch).
2. Convex dashboard → your project → **Production** deployment → Settings →
   **Generate production deploy key**.
3. Vercel → **Add New Project** → import the repo, then before deploying:
   - **Build Command:** `npx convex deploy --cmd 'npm run build'`
     (deploys Convex functions to production, then builds Next.js with the
     production `NEXT_PUBLIC_CONVEX_URL` injected automatically)
   - **Environment Variables:** `CONVEX_DEPLOY_KEY` = the key from step 2
     (Production environment).
4. Deploy. Note the URL, e.g. `https://gym-tracker-yourname.vercel.app`.
5. Configure auth on the **production** Convex deployment:

   ```bash
   npx @convex-dev/auth --prod          # site URL: your Vercel URL
   npx convex env set ALLOWED_EMAILS you@example.com --prod   # required, or nobody can sign in
   ```

6. Open the Vercel URL and create your account (production has its own database,
   separate from dev).

## 3. Install on your phone

Open the Vercel URL on your phone:
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu → **Install app**.

Open it once from the home-screen icon while online so the service worker caches
the app. When the rest timer first starts, allow notifications.

Known PWA limits (spec's open question): iOS suspends web apps in the background,
so the rest-timer notification only fires reliably if the app is open or was just
backgrounded. The countdown itself is timestamp-based, so it's always correct when
you come back.

## 3b. Lock-screen rest alerts (optional)

The rest timer can send a notification when rest starts (with your next set) and
when it ends, delivered by the server so it shows on the lock screen even while
the phone is locked. One-time setup:

```bash
npx web-push generate-vapid-keys        # prints a public and a private key
npx convex env set VAPID_PUBLIC_KEY  <public key>
npx convex env set VAPID_PRIVATE_KEY <private key>
npx convex env set VAPID_SUBJECT     mailto:you@example.com
```

Add `--prod` to each `convex env set` for the production deployment. Then on the
phone: open the app **from the Home Screen icon** (iPhone requires that — a
Safari tab can't receive push), go to Profile → Lock-screen rest alerts → **Turn
on for this device**, and allow notifications.

A live countdown on the lock screen (an iOS "Live Activity") isn't possible from
a web app; this is the closest the platform allows.

## 4. Connect Claude

1. In the app: **Profile → Claude connection → Create connector URL**. Copy it —
   it's shown once and looks like `https://<your-app>/api/mcp?token=gt_…`.
2. claude.ai → **Settings → Connectors → Add custom connector**. Name it
   "Gym Tracker", paste the URL, add. (Custom connectors need a paid plan; on
   Team/Enterprise an owner may have to allow custom connectors.)
3. In a chat, enable the connector and try:
   *"Look at my last 4 weeks of training and build me an upper/lower program with
   2 upper and 2 lower days, then make it active."*
   Claude will ask before running write tools. Then open the app — Home shows
   the new program's first routine as "Next up".
4. Revoke anytime from Profile; the connection stops working immediately.

### About connector auth

The spec's fallback is implemented: a 256-bit random token, stored only as a
SHA-256 hash in `mcpTokens`, revocable from Profile. Because claude.ai custom
connectors don't let you set request headers, the token rides in the URL query
string (`Authorization: Bearer` also works for other MCP clients). Treat the URL
like a password.

The spec's target — OAuth per the MCP authorization spec so claude.ai shows a
sign-in screen — is not built yet. Convex Auth doesn't act as an OAuth
authorization server; the cleanest path is Clerk (it has MCP OAuth support) or a
small OAuth layer on `/api/mcp`. Check the current claude.ai connector docs before
starting it.

## 5. Importing your old data

Profile → Your data → pick the unit your old app used → choose the CSV.
- **Hevy:** Settings → Export & Import Data → Export workouts.
- **Strong:** Settings → Export Strong Data.

Exercise names are matched to the library ignoring case/punctuation; anything
unmatched becomes a custom exercise (muscle "other") — fix its muscles in the
Exercise library so it counts in the weekly-sets chart. Re-importing the same
file skips workouts already imported.

## Checks

```bash
npm run typecheck   # app + Convex functions
npm run lint
npm test            # backend (convex-test, in memory), MCP tools end-to-end, import parsing, math
```

## Decisions taken on the open questions

- **Personal vs product:** built personal-first, but every table and query is
  scoped by `userId`, so multi-user isn't a rewrite.
- **PWA vs native:** PWA. Workout state is local-first (localStorage + idempotent
  sync), which covers bad gym signal; revisit Expo only if the background-timer
  limit bothers you.
- **Auth:** Convex Auth (email + password) — one fewer service. Swap to Clerk when
  you do OAuth for the connector.
- **Claude writing workouts:** no — read-mostly. Claude can create exercises,
  routines, programs and bodyweight entries, and can't delete or edit logged
  workouts or sets.
