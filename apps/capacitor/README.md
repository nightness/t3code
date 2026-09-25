# @t3tools/capacitor

A Capacitor 8 shell that packages T3 Code's **web UI** (`apps/web`) as a native iOS and
Android app. There is no app-specific code here. The webview loads the denext static
export of `apps/web`, and the app talks to a T3 server running on your computer.

This is separate from `apps/mobile`, the Expo / React Native client.

## Build flow

1. **Export the web app** (denext, not Vite):

   ```sh
   cd apps/web && deno task export     # writes apps/web/out/
   ```

2. **Copy it in and sync the native projects** (from `apps/capacitor`):

   ```sh
   pnpm sync            # or: pnpm sync:ios / pnpm sync:android
   ```

   `pnpm web:copy` (run by every `sync*` script) recreates `www/` from `../web/out`,
   skipping the precompressed `*.gz` siblings (~13 MB the webview never requests). The
   app serves `www/` at the origin root (iOS `capacitor://localhost`, Android
   `https://localhost`), so the export's root-absolute `/_denext/client/...` asset paths
   resolve unchanged.

3. **iOS.** `pnpm open:ios` opens Xcode, where you pick your team and run on a device.
   The project uses Swift Package Manager, so CocoaPods is not needed. To compile from
   the command line without signing:

   ```sh
   cd ios/App
   xcodebuild -scheme App -sdk iphoneos -configuration Debug \
     -derivedDataPath ../build CODE_SIGNING_ALLOWED=NO build
   ```

   (`ios/build/` is git-ignored.) Installing on a phone needs a signed build. Set a
   development team in Xcode.

4. **Android.** This needs the Android SDK and a JDK:

   ```sh
   cd android && ./gradlew assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
   ```

## Pairing with your computer

1. On the computer, start the server so that it listens on the LAN:
   `t3 serve --host 0.0.0.0`. It prints a pairing URL / connection string.
2. In the app, add a **remote environment** and paste that pairing URL (for example
   `http://192.168.1.20:3773/...`). A Tailscale address works the same way.

The app connects over plain `http://<host>:3773` and `ws://<host>:3773/ws` with bearer-token
auth. The server's CORS already allows any origin plus the `Authorization` / `DPoP` headers.

## OTA UI updates

The shell can pull its web UI from the T3 server it is paired with, so UI fixes reach the
phone without a new app build. denext does the work: the native `DenextOta` plugin (installed
by `denext mobile add-ota`, see `ios/App/App/Denext*.swift` and `android/.../dev/denext/ota/`),
the `_denext/ota.json` manifest, and `checkForUiUpdate` / `otaBooted` from `denext/mobile`.
Rollback, verification and serving rules are in denext's docs:
[Over-the-air UI updates](https://denext.dev/docs/desktop). It is off by default.

T3's part:

- **Server.** `T3CODE_MOBILE_UI_DIR` names a stamped web export. The server then serves
  `GET /api/mobile/ui/_denext/ota.json` and `GET /api/mobile/ui/<path>` (only the paths the
  manifest lists, `Cache-Control: no-store`), behind the same bearer auth as the rest of the
  environment API. It rereads the manifest when its mtime changes, so no restart is needed.
- **Web** (`apps/web/src/ota.ts`). Inside the shell, after the first render and on each resume
  that counts as a reconnect (10 s or more in the background), it checks the first saved,
  switched-on bearer environment at `<httpBaseUrl>/api/mobile/ui`.
- **Bundle.** `pnpm web:copy` stamps `www/_denext/ota.json` after branding, so an unchanged
  export is never downloaded.
- **Signing.** The app embeds an ECDSA P-256 public key (`DenextOtaPublicKey` in Info.plist,
  `dev.denext.ota.PUBLIC_KEY` in AndroidManifest) and refuses any UI whose manifest is not signed
  by the matching private key, so nobody on the network between the phone and the server can
  swap the UI. The key is a release secret: make one with `denext ota keygen <file>`, embed the
  public half with `denext mobile add-ota --force --public-key <file>.pub`, and keep the private
  half out of the repo (a CI secret; locally e.g. `~/.config/t3code/ota-signing.key`). The key
  committed here is a development key; production builds embed T3's own.

**Prepare the server's export.** Stamp it after branding, exactly as `web:copy` does:

```sh
cd apps/web && deno task export
# The script resolves its target against the repo root, whatever the working directory.
node ../../scripts/apply-web-brand-assets.ts production apps/web/out
deno run -A --node-modules-dir=none <denext CLI> ota manifest out --sign ~/.config/t3code/ota-signing.key
# see DENEXT_CLI in scripts/copy-web.mjs; in CI, DENEXT_OTA_SIGNING_KEY (the PEM) replaces --sign
T3CODE_MOBILE_UI_DIR="$PWD/out" t3 serve --host 0.0.0.0
```

Over LAN `http`, the SHA-256 checks catch corruption but not a man-in-the-middle; use TLS end
to end (for example Tailscale HTTPS) where that matters.

## T3 Connect sign-in and agent notifications

With T3 Connect configured, the shell signs in to the same Clerk account as the React Native
app and registers for the relay's agent notifications. denext does the native work
(`denext mobile add push`, `add auth-session --scheme t3code` and `add device`; see
denext's docs, [Push and Auth sessions](https://denext.dev/docs/desktop)). T3's part:

- **Config.** The export reads the public T3 Connect config the way the Vite build does
  (`loadRepoEnv` in `scripts/lib/public-config.ts`): `T3CODE_CLERK_PUBLISHABLE_KEY`,
  `T3CODE_CLERK_JWT_TEMPLATE` and `T3CODE_RELAY_URL` from the process env, `.env.local` or
  `.env` at the repo root. `cp .env.example .env` before `deno task export` gives the
  production values. Without them the app has no cloud features and pairs over the LAN only.
- **Sign-in** (`apps/web/src/components/clerk/capacitorClerkBridge.ts`). Clerk runs as in the
  Electron app (`@clerk/electron/react`: native mode, no cookies), with the client token in the
  Keychain and OAuth in the system sign-in sheet (`openAuthSession`), redirecting to the
  desktop app's `t3code://app/`. The Clerk instance must accept requests from the
  `capacitor://localhost` origin (its allowed origins).
- **Notifications** (`apps/web/src/cloud/nativePushRegistration.ts`). After sign-in the app asks
  for permission, gets the APNs token and registers the device with the relay
  (`POST /v1/mobile/devices`, relay client `t3-mobile`); sign-out unregisters it. A tap opens
  the thread in the payload's `deepLink` (`apps/web/src/deepLinks.ts`).
- **APNs environment.** Debug builds are development-signed (`aps-environment: development` in
  `ios/App/App/App.entitlements`) and register as `sandbox`; an archive exported for
  TestFlight or the App Store is re-signed with `production` and registers as `production`.
  The page tells them apart by `window.Capacitor.DEBUG`, which `ios/debug.xcconfig` turns on
  for the Debug configuration only, so a Release build run from Xcode with development
  signing would register the wrong environment.
- **Relay.** The relay sends with its own APNs key to the topic `com.brainwires.t3code`, so
  that key must belong to the team that owns this bundle id.

## Cleartext and local-network notes

The app is served from a secure origin but talks to an `http://` / `ws://` server, so both
platforms allow cleartext and mixed content:

- **iOS** (`ios/App/App/Info.plist`): `NSAppTransportSecurity` sets
  `NSAllowsArbitraryLoads` and `NSAllowsLocalNetworking` to true.
  `NSLocalNetworkUsageDescription` supplies the text for the Local Network permission
  prompt, which iOS shows the first time the app reaches a LAN address. If you deny the
  prompt, LAN connections fail silently. Re-enable it under Settings → Privacy &
  Security → Local Network.
- **Android**: `android:usesCleartextTraffic="true"` on `<application>` in
  `android/app/src/main/AndroidManifest.xml`, plus `android.allowMixedContent: true` in
  `capacitor.config.ts`.

## Keyboard

`@capacitor/keyboard` runs with `resize: "native"` (`plugins.Keyboard` in
`capacitor.config.ts`). WKWebView ignores `interactive-widget=resizes-content`, so the
plugin resizes the WKWebView frame itself when the keyboard shows. The layout is sized
in viewport units (`h-svh` / `h-dvh`), so it shrinks with the frame, and the docked
composer sits directly above the keyboard. The plugin also hides the iOS form accessory
bar (prev/next/done) when it loads.

## Icons

`assets/icon.png` is an opaque 1024×1024 square composited from the production Icon
Composer source (`assets/prod/app-icon.icon`: black fill plus `text.svg` at scale 8.5).
Regenerate the native icons and splash screens with:

```sh
npx @capacitor/assets generate --iconBackgroundColor '#0a0a0a' --iconBackgroundColorDark '#0a0a0a' \
  --splashBackgroundColor '#0a0a0a' --splashBackgroundColorDark '#0a0a0a'
```

The tool also writes PWA icons to `icons/`. They are not used here, so delete them.
