"use client";

// Rest timer on the iPhone lock screen. Only does anything inside the native
// shell (ios/): there the WebView is suspended while the phone is locked, so
// the countdown is handed to iOS as a Live Activity (drawn by the RestActivity
// widget extension) and the "rest over" alert is a local notification.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

interface LiveActivityPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  start(opts: { endsAt: number; totalSec: number; label: string; detail?: string }): Promise<void>;
  end(): Promise<void>;
}

const LiveActivity = registerPlugin<LiveActivityPlugin>("LiveActivity");
const REST_NOTIFICATION_ID = 1;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export interface RestState {
  endsAt: number;
  totalSec: number;
  label: string;
  detail?: string;
}

/** Mirror the local rest state to the lock screen; call with null when rest ends. */
export async function syncRestActivity(rest: RestState | null): Promise<void> {
  if (!isNativeApp()) return;
  try {
    if (rest && rest.endsAt > Date.now()) {
      await LiveActivity.start(rest);
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display === "granted") {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: REST_NOTIFICATION_ID,
              title: "Rest over",
              body: `Next: ${rest.label}${rest.detail ? ` · ${rest.detail}` : ""}`,
              schedule: { at: new Date(rest.endsAt) },
            },
          ],
        });
      }
    } else {
      await LiveActivity.end();
      await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] });
    }
  } catch {
    // Live Activities off in Settings, or an old iOS: the in-app timer still works.
  }
}
