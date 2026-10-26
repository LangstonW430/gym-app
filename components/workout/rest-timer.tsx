"use client";

import { useMutation, useQuery } from "convex/react";
import { Timer } from "lucide-react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { patchLocal, useLocalWorkout } from "@/lib/active-workout";
import { fmtDuration } from "@/lib/format";
import { haptic, useNow } from "@/lib/hooks";

export function startRest(totalSec: number, label: string, detail?: string) {
  if (totalSec <= 0) return;
  patchLocal((w) => ({ ...w, rest: { endsAt: Date.now() + totalSec * 1000, totalSec, label, detail } }));
  // Ask once, from a user gesture (set completion), so the timer can notify.
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission().catch(() => {});
  }
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch {}
}

async function notify(label: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body: `Next set: ${label}`, tag: "rest-timer", renotify: true, silent: false } as NotificationOptions;
    if (reg) await reg.showNotification("Rest over", opts);
    else new Notification("Rest over", opts);
  } catch {}
}

/**
 * Floating rest pill. The end time is stored as a timestamp, so it survives the
 * phone locking or the app being killed; on return it shows the right value.
 */
export function RestTimer() {
  const w = useLocalWorkout();
  const now = useNow(250);
  const fired = useRef<number | null>(null);
  const rest = w?.rest;
  const remaining = rest ? Math.ceil((rest.endsAt - now) / 1000) : 0;

  // Mirror the timer to the server so a push alert lands on the lock screen at
  // zero (the page itself is suspended while the phone is locked). Only when
  // this account has a registered device; otherwise it's a no-op.
  const push = useQuery(api.push.status);
  const scheduleRest = useMutation(api.push.scheduleRest);
  const cancelRest = useMutation(api.push.cancelRest);
  const synced = useRef<{ endsAt: number; label: string } | null>(null);
  useEffect(() => {
    if (!push || push.devices.length === 0) return;
    if (rest && rest.endsAt > Date.now()) {
      if (synced.current?.endsAt === rest.endsAt) return;
      const fresh = synced.current?.label !== rest.label;
      synced.current = { endsAt: rest.endsAt, label: rest.label };
      const t = setTimeout(() => {
        void scheduleRest({ endsAt: rest.endsAt, title: rest.label, body: rest.detail ?? "Next set", announce: fresh }).catch(() => {});
      }, 400);
      return () => clearTimeout(t);
    }
    if (!rest && synced.current) {
      synced.current = null;
      void cancelRest().catch(() => {});
    }
  }, [rest, push, scheduleRest, cancelRest]);

  useEffect(() => {
    if (!rest || remaining > 0 || fired.current === rest.endsAt) return;
    fired.current = rest.endsAt;
    // Only alert if we're within a few seconds of the end (not on a stale reopen).
    if (now - rest.endsAt < 5000) {
      haptic([200, 100, 200]);
      beep();
      if (document.visibilityState !== "visible") void notify(rest.label);
    }
    patchLocal((x) => ({ ...x, rest: null }));
  }, [rest, remaining, now]);

  if (!rest || remaining <= 0) return null;
  const pct = Math.max(0, Math.min(1, remaining / rest.totalSec));
  const adjust = (d: number) =>
    patchLocal((x) =>
      x.rest ? { ...x, rest: { ...x.rest, endsAt: x.rest.endsAt + d * 1000, totalSec: Math.max(1, x.rest.totalSec + d) } } : x,
    );

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-safe">
      <div className="mx-auto mb-3 flex max-w-lg items-center gap-2 overflow-hidden rounded-2xl border bg-card p-2 shadow-xl">
        <div className="relative flex min-w-0 flex-1 items-center gap-2 pl-1">
          <Timer className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="num text-2xl font-semibold leading-none">{fmtDuration(remaining)}</div>
            <div className="truncate text-xs text-muted-foreground">Rest · {rest.label}</div>
          </div>
          <div className="absolute -bottom-2 left-0 h-1 rounded-full bg-primary transition-[width]" style={{ width: `${pct * 100}%` }} />
        </div>
        <button className="num h-12 w-12 shrink-0 rounded-xl bg-secondary text-sm font-medium" onClick={() => adjust(-15)}>
          −15
        </button>
        <button className="num h-12 w-12 shrink-0 rounded-xl bg-secondary text-sm font-medium" onClick={() => adjust(15)}>
          +15
        </button>
        <button
          className="h-12 shrink-0 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground"
          onClick={() => patchLocal((x) => ({ ...x, rest: null }))}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
