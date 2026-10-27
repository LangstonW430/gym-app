import type { CapacitorConfig } from "@capacitor/cli";

// The iOS shell is a thin WebView around the deployed site, so web changes
// ship without rebuilding the app. APP_URL is set at build time (CI variable).
const url = process.env.APP_URL;
if (!url) throw new Error("APP_URL is required (e.g. https://your-app.vercel.app)");

const config: CapacitorConfig = {
  appId: "com.langstonw430.gymtracker",
  appName: "Gym",
  webDir: "ios/www",
  server: { url, cleartext: false },
  // Matches the dark theme's --background so over-scroll at the top/bottom
  // doesn't flash the WebView's default white.
  backgroundColor: "#111110",
  // "never": the site pads for the notch and home indicator itself (env(safe-area-inset-*)),
  // so a native inset would let the page scroll past the tab bar.
  ios: { contentInset: "never", scheme: "Gym" },
};

export default config;
