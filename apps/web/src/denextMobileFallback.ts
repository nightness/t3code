/**
 * `denext/mobile` for the Node toolchain. The denext export (the build the Capacitor shell
 * bundles) resolves `denext/mobile` to the real module through deno.json's import map, but tsc,
 * the Vite build (browser, Electron), vitest and knip resolve through node_modules, where denext
 * has no package. tsconfig.json maps the specifier here for them. Those builds never run inside
 * the native shell, so this is exactly what denext itself does there: nothing. Keep the
 * signatures in step with denext's `src/mobile/ota.ts` and `src/mobile/resume.ts`.
 */

type OtaPrepareResult =
  | { readonly kind: "unsupported" }
  | { readonly kind: "current" }
  | {
      readonly kind: "ready";
      readonly version: string;
      readonly required: boolean;
      readonly notes: string | null;
    }
  | { readonly kind: "skipped"; readonly reason: "rejected" | "busy" }
  | { readonly kind: "error"; readonly reason: string };

type OtaApplyResult =
  | { readonly kind: "unsupported" }
  | { readonly kind: "error"; readonly reason: string };

export function prepareUiUpdate(_options: {
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetch?: typeof fetch;
}): Promise<OtaPrepareResult> {
  return Promise.resolve({ kind: "unsupported" });
}

export function applyUiUpdate(_version: string): Promise<OtaApplyResult> {
  return Promise.resolve({ kind: "unsupported" });
}

export function otaBooted(): Promise<void> {
  return Promise.resolve();
}

export function onAppResume(_cb: (awayMs: number) => void): () => void {
  return () => {};
}
