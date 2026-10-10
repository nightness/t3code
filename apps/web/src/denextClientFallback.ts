/**
 * The `spa.shell` handoff from `denext/client` for the Node toolchain. The denext export resolves
 * `denext/client` to the real module through deno.json's import map, but tsc, the Vite build
 * (browser, Electron), vitest and knip resolve through node_modules, where denext has no package.
 * tsconfig.json maps the specifier here for them, as it does `denext/mobile`
 * (./denextMobileFallback.ts). No such build prerenders a shell, so this is what denext itself
 * does on a page without one: nothing to hand over, and ready at once. Keep the signatures in
 * step with denext's `src/client/shell-handoff.ts`.
 */

/** What the user did in one shell field before the app took over. */
export interface ShellHandoff {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  focused: boolean;
  scrollTop: number;
}

export function shellReady(): Promise<void> {
  return Promise.resolve();
}

export function consumeShellHandoff(_key: string): ShellHandoff | null {
  return null;
}
