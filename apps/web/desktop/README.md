# Deno Desktop build

`deno task desktop` (macOS) and `deno task desktop:package` build the Deno Desktop app. By default
the app runs its own T3 server as an in-app sidecar (`denext.config.ts` `desktop.sidecars`;
build it first with `pnpm --filter t3 build:bundle`).

## Using a server that is already running

Two servers on one `~/.t3` share one database with no lock. If you keep a server running (a
`t3 serve` LaunchAgent on `127.0.0.1:3773`, so your phone reaches it with the desktop app closed),
build the desktop app to connect to it instead of starting its own:

```sh
deno task desktop:external            # macOS: build and open
deno task desktop:package:external    # any OS: package into dist/
# same thing:
T3_DESKTOP_SERVER=external deno task desktop:package
# another server than http://127.0.0.1:3773:
T3_DESKTOP_SERVER=external T3_DESKTOP_SERVER_URL=http://127.0.0.1:4000 deno task desktop:package
```

The choice is made when the app is built and baked into it (`.deno-desktop/config.json`; the
packaged app never reads the environment). In external mode there is no `server` sidecar and
`spa.proxy` points at the given server, so the window signs in the way a build without a sidecar
always has: the pairing screen once, then the bearer is kept in the keychain.
`T3_DESKTOP_SERVER_URL` is an origin (`http` or `https`, no path); a non-loopback host is allowed
explicitly in the proxy config. Leave `T3_DESKTOP_SERVER` unset for the sidecar build.
