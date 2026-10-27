# iPhone app (lock-screen rest timer)

The web app can't show a live countdown on the lock screen: iOS only lets
native apps do that, through Live Activities. So `ios/` holds a thin native
shell: a Capacitor WebView that loads the deployed site, plus a small widget
extension that draws the rest timer and your next set on the lock screen and
in the Dynamic Island. Web changes ship without touching it; the shell only
needs rebuilding when something under `ios/` changes.

No Mac and no paid developer account are needed: GitHub Actions builds the
app on a macOS runner, and SideStore or AltStore installs it with a free
Apple ID from a Windows or Linux PC.

## 1. Build it (GitHub Actions)

1. On GitHub: **Settings → Secrets and variables → Actions → Variables → New
   repository variable**. Name `APP_URL`, value your deployed site, e.g.
   `https://gym-tracker-you.vercel.app`.
2. **Actions → iOS app → Run workflow**. It also runs on its own whenever
   `ios/` changes on `main`.
3. About five minutes later `Gym.ipa` is attached to the **ios-latest**
   release on the repo's Releases page. That link stays the same for every
   build, so you can open it straight from the phone.

## 2. Install it (SideStore, free Apple ID)

You need a Windows or Linux PC once, for pairing. After that the phone
refreshes the app on its own.

1. On the PC, follow the SideStore install guide at
   <https://docs.sidestore.io/docs/getting-started/>. In short: install
   iTunes and iCloud from Apple's site (not the Microsoft Store), install
   SideStore's companion app (AltServer), plug in the phone, and install
   SideStore from the AltServer tray icon. Sign in with your Apple ID: it is
   used only to request a free development certificate.
2. iOS hides Developer Mode until a developer tool has talked to the phone,
   so it only appears now: **Settings → Privacy & Security**, scroll to the
   bottom, **Developer Mode → on**, restart when asked.
3. On the phone, open SideStore once, let it set up its VPN profile, and
   copy the pairing file when the guide asks.
4. Open the **ios-latest** release page in Safari on the phone, download
   `Gym.ipa`, then in SideStore tap **+** and pick the file. Include the
   **RestActivity** extension when it asks: that is the lock-screen widget.
5. **Settings → Gym → Live Activities → on** (and allow notifications when
   the app first asks).

AltStore works the same way, except refreshes happen only while the phone
is on the same Wi-Fi as the PC running AltServer.

### What to expect on a free Apple ID

- The certificate lasts 7 days. SideStore refreshes it in the background;
  if it can't (no VPN profile, phone off for a week), the app shows
  "Unable to verify" until you open SideStore and tap **Refresh**.
- At most 3 sideloaded apps at a time, and 10 app IDs per week. This app
  uses two IDs (app + widget).
- No push notifications from the server. In the native shell the rest alert
  is a local notification scheduled on the phone, so nothing is lost.

## How it works

- `capacitor.config.ts`: `server.url` points the WebView at `APP_URL`.
- `lib/live-activity.ts`: when a rest starts, is adjusted, skipped or ends,
  the web app calls the `LiveActivity` plugin and schedules/cancels a local
  notification. On the plain website these calls are no-ops.
- `ios/App/App/LiveActivityPlugin.swift`: starts, updates and ends the
  activity with ActivityKit.
- `ios/App/RestActivity/`: the SwiftUI views for the lock screen and Dynamic
  Island. iOS counts down to `endsAt` itself, so nothing runs in the
  background.
- `ios/configure.rb`: wires the extension into the Xcode project. Run it
  again after a fresh `npx cap add ios --packagemanager SPM`.
- `.github/workflows/ios.yml`: the unsigned build and release upload.

To change the bundle id, edit `appId` in `capacitor.config.ts` and
`BUNDLE_ID` in `ios/configure.rb`.
