// Entry for the Deno Desktop build's server sidecar (apps/web `desktop.sidecars`):
// denext imports this module in a worker of the app's runtime, so `import.meta.main`
// is false and bin.ts would do nothing. Outside a sidecar it does nothing either.
import { provideInProcessBootstrapEnvelope } from "./bootstrap.ts";
import {
  DESKTOP_SIDECAR_EXEC_PATH,
  desktopSidecarBootstrap,
  prepareDesktopSidecarProcess,
  readDenextSidecar,
} from "./desktopSidecar.ts";

const sidecar = readDenextSidecar();
if (sidecar !== undefined) {
  prepareDesktopSidecarProcess(process);
  provideInProcessBootstrapEnvelope(desktopSidecarBootstrap(sidecar));
  const { runCli } = await import("./binCli.ts");
  runCli({ hostExecutablePath: DESKTOP_SIDECAR_EXEC_PATH });
}
