import type { CapacitorConfig } from "@capacitor/cli";

// The web UI is apps/web's denext static export, copied into www/ by
// scripts/copy-web.mjs. The default schemes are kept (iOS capacitor://localhost,
// Android https://localhost) so the root-absolute /_denext/client/... asset paths
// resolve against webDir. The app reaches the T3 server over plain http/ws on the
// LAN, hence mixed content on Android (cleartext is also enabled in the manifest,
// and ATS is relaxed in the iOS Info.plist).
const config: CapacitorConfig = {
  appId: "com.brainwires.t3code",
  appName: "T3 Code",
  webDir: "www",
  android: {
    allowMixedContent: true,
  },
};

export default config;
