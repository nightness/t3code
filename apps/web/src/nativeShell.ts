interface CapacitorGlobal {
  readonly isNativePlatform?: () => boolean;
}

/**
 * True inside the Capacitor iOS/Android shell (apps/capacitor). Capacitor's
 * native bridge defines window.Capacitor before any page script runs, so this
 * is reliable at module load time without importing @capacitor/core. The page
 * origin there (capacitor://localhost, https://localhost) has no T3 server
 * behind it, so the shell runs as a hosted static app that pairs with remote
 * environments.
 */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}
