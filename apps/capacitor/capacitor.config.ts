/// <reference types="@capacitor/keyboard" />

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
  plugins: {
    // WKWebView ignores the viewport's interactive-widget=resizes-content, so
    // without this the iOS keyboard slides over the docked chat composer.
    // "native" shrinks the WKWebView frame to end at the keyboard's top edge:
    // the layout viewport (and every svh/dvh unit) shrinks with it, the
    // bottom-anchored composer lands directly above the keyboard, and
    // env(safe-area-inset-bottom) drops to 0 because the frame no longer
    // reaches the home indicator. "body" would only resize <body> (the layout
    // is sized in viewport units, so it would not move) and "none" would leave
    // the composer covered. The plugin also hides the form accessory bar
    // (prev/next/done) on load, which a chat composer does not need.
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
