# iPhone app (lock-screen rest timer)

The web app can't show a live countdown on the lock screen: iOS only lets
native apps do that, through Live Activities. So `ios/` holds a thin native
shell: a Capacitor WebView that loads the deployed site, plus a small widget
extension that draws the rest timer and your next set on the lock screen and
in the Dynamic Island. Web changes ship without touching it; the shell only
needs rebuilding when something under `ios/` changes.

No Mac and no paid developer account are needed: GitHub Actions builds the
app on a macOS runner, and SideStore or AltStore installs it with a free
Apple ID from a Windows or Linux PC (one-time setup).

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

Checked against <https://docs.sidestore.io/docs/installation/prerequisites>
(October 2026). You need a 64-bit Windows, Linux or macOS computer once;
after that the phone refreshes the app on its own.

### One-time SideStore setup

1. On the phone, install **LocalDevVPN** from the App Store
   (<https://apps.apple.com/app/localdevvpn/id6755608044>). Open it, tap
   Connect, and allow the VPN configuration. It only talks to the phone
   itself; no data or battery cost.
2. On the PC, install iTunes (Microsoft Store or Apple's site, either works).
3. Install **iloader**:
   <https://github.com/nab138/iloader/releases/latest/download/iloader-windows-x64.msi>.
4. Plug the phone in with a cable, unlock it, tap **Trust**.
5. Open iloader, sign in with your Apple ID (used only to request a free
   development certificate), select the phone, choose
   **Install SideStore (Stable)**.
6. On the phone: **Settings → General → VPN & Device Management**, tap the
   "Developer App" entry with your Apple ID, then **Trust** (iOS 18+: **Allow
   & Restart**, enter your passcode).
7. **Settings → Privacy & Security**, scroll to the bottom, turn on
   **Developer Mode**. The phone restarts. (The toggle is hidden until
   step 6 has happened.)
8. Open LocalDevVPN and tap Connect. Open SideStore, sign in with the same
   Apple ID, go to **My Apps**, tap the **7 DAYS** counter next to SideStore
   to finish setup. Tap Yes if asked to create a signing certificate.

### Installing the Gym app

1. With LocalDevVPN connected, open this in Safari on the phone and tap
   Open when it asks to open SideStore:
   `sidestore://install?url=https://github.com/LangstonW430/gym-app/releases/download/ios-latest/Gym.ipa`
   (Or download `Gym.ipa` from the **ios-latest** release page; Safari shows
   a share sheet, so tap **SideStore** in it, or Save to Files and then use
   **+** in SideStore.) If it asks about app extensions, include them:
   **RestActivity** is the lock-screen widget.
2. **Settings → Gym → Live Activities → on**. Open the app and allow
   notifications when it asks.

### What to expect on a free Apple ID

- Apps expire after 7 days. SideStore refreshes them in the background
  while LocalDevVPN is connected. If Gym shows "Unable to verify", open
  SideStore and tap its days counter.
- At most 3 sideloaded apps at a time (SideStore counts as one) and 10 app
  IDs per week. This app uses two IDs (app + widget).
- If a phone update or reset breaks SideStore, plug into the PC, open
  iloader, and use **Manage Pairing File → Place** next to SideStore.
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
