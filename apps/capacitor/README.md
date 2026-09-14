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

## Icons

`assets/icon.png` is an opaque 1024×1024 square composited from the production Icon
Composer source (`assets/prod/app-icon.icon`: black fill plus `text.svg` at scale 8.5).
Regenerate the native icons and splash screens with:

```sh
npx @capacitor/assets generate --iconBackgroundColor '#0a0a0a' --iconBackgroundColorDark '#0a0a0a' \
  --splashBackgroundColor '#0a0a0a' --splashBackgroundColorDark '#0a0a0a'
```

The tool also writes PWA icons to `icons/`. They are not used here, so delete them.
