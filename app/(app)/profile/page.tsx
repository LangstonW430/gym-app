"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { BellRing, Bot, Copy, Download, LogOut, Moon, Sun, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Page, PageHeader, Section } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { api } from "@/convex/_generated/api";
import type { Units } from "@/convex/lib/shared";
import { fmtDate, fmtRelativeDay } from "@/lib/format";
import { bodyweightCsv, download, parseWorkoutCsv, setsCsv } from "@/lib/import-export";
import { isNativeApp, liveActivityStatus, testRestActivity } from "@/lib/live-activity";
import { useSettings } from "@/lib/settings";
import { currentSubscription, deviceLabel, isIOS, isStandalone, pushSupported, subscribePush, unsubscribePush } from "@/lib/push";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

export default function ProfilePage() {
  const s = useSettings();
  const update = useMutation(api.users.updateSettings);
  const { signOut } = useAuthActions();
  const [theme, setThemeState] = useState<Theme>(() => (typeof window === "undefined" ? "dark" : getTheme()));
  // Read after hydration so the server-rendered HTML matches the first client render.
  const native = useSyncExternalStore(
    () => () => {},
    () => isNativeApp(),
    () => false,
  );

  const inv = s.plateInventory[s.units];

  return (
    <>
      <PageHeader title="Profile" subtitle={s.email} />
      <Page>
        <Section title="Preferences">
          <Card>
            <CardContent className="flex flex-col gap-4 p-4">
              <Row label="Units" hint="History is stored once and converted for display.">
                <Segmented<Units>
                  value={s.units}
                  onChange={(u) => update({ units: u })}
                  options={[
                    { value: "lb", label: "lb" },
                    { value: "kg", label: "kg" },
                  ]}
                />
              </Row>
              <Row label="Theme">
                <Segmented<Theme>
                  value={theme}
                  onChange={(t) => {
                    setTheme(t);
                    setThemeState(t);
                  }}
                  options={[
                    { value: "dark", label: "Dark" },
                    { value: "light", label: "Light" },
                  ]}
                />
              </Row>
              <Row label="Default rest" hint="Used when an exercise has no rest time of its own.">
                <NativeSelect value={s.defaultRestSec} onChange={(e) => update({ defaultRestSec: Number(e.target.value) })} className="w-28">
                  {[60, 90, 120, 150, 180, 240, 300].map((n) => (
                    <option key={n} value={n}>
                      {Math.floor(n / 60)}:{String(n % 60).padStart(2, "0")}
                    </option>
                  ))}
                </NativeSelect>
              </Row>
            </CardContent>
          </Card>
        </Section>

        <Section title={`Plate inventory (${s.units})`}>
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="grid grid-cols-[5rem_1fr] items-center gap-2">
                <Label htmlFor="bar">Bar</Label>
                <Input
                  id="bar"
                  key={`bar-${s.units}-${inv.bar}`}
                  inputMode="decimal"
                  defaultValue={inv.bar}
                  onBlur={(e) => {
                    const bar = Number(e.target.value);
                    if (bar > 0) update({ plateInventory: { ...s.plateInventory, [s.units]: { ...inv, bar } } });
                  }}
                />
                <Label htmlFor="plates">Plates</Label>
                <Input
                  id="plates"
                  key={`plates-${s.units}-${inv.plates.join()}`}
                  defaultValue={inv.plates.join(", ")}
                  onBlur={(e) => {
                    const plates = e.target.value
                      .split(/[,\s]+/)
                      .map(Number)
                      .filter((n) => n > 0);
                    if (plates.length) update({ plateInventory: { ...s.plateInventory, [s.units]: { ...inv, plates } } });
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Comma-separated plate sizes you have (assumes pairs). Used by the plate calculator.</p>
            </CardContent>
          </Card>
        </Section>

        {native ? <LockScreenTimer /> : <PushAlerts />}
        <ClaudeConnection />
        <DataSection units={s.units} />

        <Section title="More">
          <Card>
            <ul className="divide-y">
              <li>
                <Link href="/programs" className="flex min-h-12 items-center px-4">Programs & routines</Link>
              </li>
              <li>
                <Link href="/exercises" className="flex min-h-12 items-center px-4">Exercise library</Link>
              </li>
              <li>
                <Link href="/bodyweight" className="flex min-h-12 items-center px-4">Bodyweight</Link>
              </li>
            </ul>
          </Card>
        </Section>

        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut /> Sign out
        </Button>
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          {theme === "dark" ? <Moon className="size-3" /> : <Sun className="size-3" />} Install: Share → Add to Home Screen
        </p>
      </Page>
    </>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ClaudeConnection() {
  const tokens = useQuery(api.mcp.listTokens);
  const create = useMutation(api.mcp.createToken);
  const revoke = useMutation(api.mcp.revokeToken);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const active = (tokens ?? []).filter((t) => !t.revokedAt);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = fresh ? `${origin}/api/mcp?token=${fresh}` : "";

  return (
    <Section title="Claude connection">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <Bot className="size-6 text-primary" />
            <div className="flex-1">
              <p className="font-medium">Claude custom connector</p>
              <p className="text-xs text-muted-foreground">
                {active.length
                  ? active.some((t) => t.lastUsedAt)
                    ? `Connected · last used ${fmtRelativeDay(Math.max(...active.map((t) => t.lastUsedAt ?? 0)))}`
                    : "Token created · not used yet"
                  : "Not connected"}
              </p>
            </div>
            {active.length > 0 && <Badge variant="success">On</Badge>}
          </div>

          {fresh ? (
            <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-sm font-medium">Connector URL — copy it now, it won&apos;t be shown again</p>
              <code className="break-all rounded bg-muted p-2 text-xs">{url}</code>
              <Button
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                }}
              >
                <Copy /> {copied ? "Copied" : "Copy URL"}
              </Button>
              <p className="text-xs text-muted-foreground">
                In claude.ai: Settings → Connectors → Add custom connector → paste this URL. Treat it like a password; revoke it here anytime.
              </p>
            </div>
          ) : (
            <Button
              variant="secondary"
              onClick={async () => {
                const label = window.prompt("Label for this connection", "claude.ai") ?? "claude.ai";
                setFresh(await create({ label }));
                setCopied(false);
              }}
            >
              Create connector URL
            </Button>
          )}

          {(tokens ?? []).length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {tokens!.map((t) => (
                <li key={t._id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {fmtDate(t.createdAt)}
                      {t.lastUsedAt ? ` · used ${fmtRelativeDay(t.lastUsedAt)}` : ""}
                      {t.revokedAt ? " · revoked" : ""}
                    </p>
                  </div>
                  {!t.revokedAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.confirm("Revoke this token? Claude will lose access immediately.") && revoke({ id: t._id })}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Claude can read your training and create routines, programs, custom exercises, and bodyweight entries. It can never delete workouts or sets.
          </p>
        </CardContent>
      </Card>
    </Section>
  );
}

function DataSection({ units }: { units: Units }) {
  const convex = useConvex();
  const importWorkouts = useMutation(api.data.importWorkouts);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [srcUnits, setSrcUnits] = useState<Units>(units);

  async function exportAs(kind: "json" | "csv") {
    setBusy(true);
    try {
      const data = await convex.query(api.data.exportAll, {});
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "json") download(`gym-export-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
      else {
        download(`gym-sets-${stamp}.csv`, setsCsv(data, units), "text/csv");
        if (data.bodyweight.length) download(`gym-bodyweight-${stamp}.csv`, bodyweightCsv(data, units), "text/csv");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Your data">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => exportAs("csv")}>
              <Download /> CSV
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => exportAs("json")}>
              <Download /> JSON
            </Button>
          </div>
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-sm font-medium">Import from Hevy or Strong</p>
            <Row label="Weights in that file are" hint="Hevy files say their unit; Strong files don't.">
              <Segmented<Units>
                value={srcUnits}
                onChange={setSrcUnits}
                options={[
                  { value: "lb", label: "lb" },
                  { value: "kg", label: "kg" },
                ]}
              />
            </Row>
            <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input text-sm font-medium hover:bg-muted">
              <Upload className="size-4" /> Choose CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  setMsg("Reading file…");
                  try {
                    const { format, workouts } = parseWorkoutCsv(await file.text(), srcUnits);
                    let imported = 0, skipped = 0, created = 0;
                    // Batches keep each mutation well under Convex's per-call limits.
                    for (let i = 0; i < workouts.length; i += 20) {
                      setMsg(`Importing ${Math.min(i + 20, workouts.length)} / ${workouts.length} workouts…`);
                      const r = await importWorkouts({ source: format, workouts: workouts.slice(i, i + 20) });
                      imported += r.imported;
                      skipped += r.skipped;
                      created += r.createdExercises;
                    }
                    setMsg(
                      `Imported ${imported} ${format === "hevy" ? "Hevy" : "Strong"} workouts` +
                        (skipped ? `, skipped ${skipped} already imported` : "") +
                        (created ? `. Created ${created} custom exercises for names that didn't match — set their muscles in the library.` : "."),
                    );
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : "Import failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

function LockScreenTimer() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof liveActivityStatus>> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void liveActivityStatus().then(setStatus);
  }, []);
  return (
    <Section title="Lock-screen rest timer">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <BellRing className="size-6 text-primary" />
            <div className="flex-1">
              <p className="font-medium">Live Activity</p>
              <p className="text-xs text-muted-foreground">
                The rest countdown and your next set on the lock screen, starting when you complete a set.
              </p>
            </div>
            {status?.available && <Badge variant="success">On</Badge>}
          </div>
          {status && !status.available && (
            <p className="text-sm text-muted-foreground">
              {status.error
                ? `Not reachable: ${status.error}`
                : "Turned off. On the phone: Settings → Gym → Live Activities → on, then reopen the app."}
            </p>
          )}
          <Button
            variant="outline"
            onClick={async () => {
              setMsg(null);
              try {
                await testRestActivity();
                setMsg("Started a 30-second test. Lock your phone now.");
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Couldn't start the activity");
              }
            }}
          >
            Test on the lock screen
          </Button>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        </CardContent>
      </Card>
    </Section>
  );
}

function PushAlerts() {
  const status = useQuery(api.push.status);
  const subscribe = useMutation(api.push.subscribe);
  const unsubscribe = useMutation(api.push.unsubscribe);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void currentSubscription().then((s) => setEndpoint(s?.endpoint ?? null));
  }, []);
  const supported = pushSupported();
  const thisDeviceOn = !!endpoint && !!status?.devices.some((d) => d.endpoint === endpoint);
  const needsInstall = isIOS() && !isStandalone();

  return (
    <Section title="Lock-screen rest alerts">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <BellRing className="size-6 text-primary" />
            <div className="flex-1">
              <p className="font-medium">Rest timer notifications</p>
              <p className="text-xs text-muted-foreground">
                A banner when rest starts (with your next set) and one when it ends — even with the phone locked.
              </p>
            </div>
            {thisDeviceOn && <Badge variant="success">On</Badge>}
          </div>
          {!status?.publicKey ? (
            <p className="text-sm text-muted-foreground">Not set up on the server yet — see SETUP.md (VAPID keys).</p>
          ) : needsInstall ? (
            <p className="text-sm text-muted-foreground">
              On iPhone this needs the app on your Home Screen: in Safari tap Share → <b>Add to Home Screen</b>, open it from there, then come back here.
            </p>
          ) : !supported ? (
            <p className="text-sm text-muted-foreground">This browser doesn&apos;t support push notifications.</p>
          ) : thisDeviceOn ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const ep = await unsubscribePush();
                  if (ep) await unsubscribe({ endpoint: ep });
                  setEndpoint(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Turn off on this device
            </Button>
          ) : (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg(null);
                try {
                  const sub = await subscribePush(status.publicKey!);
                  await subscribe({ ...sub, label: deviceLabel() });
                  setEndpoint(sub.endpoint);
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Couldn't enable notifications");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Turn on for this device
            </Button>
          )}
          {msg && <p className="text-sm text-destructive">{msg}</p>}
          {status && status.devices.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {status.devices.map((d) => (
                <li key={d._id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1">
                    {d.label}
                    {d.endpoint === endpoint ? " (this device)" : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">{fmtDate(d.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}
