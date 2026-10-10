/**
 * index.html's boot splash (styled by `#boot-shell` in denext.config.ts's `spa.head`), which
 * lib/bootError.ts fills with a startup failure. The prerendered shell shows it on the routes it
 * has no layout for, and the phone exports show it in place of the shell (AppShell.static.mobile.tsx).
 */
export function BootSplash() {
  return (
    <div id="boot-shell">
      <div id="boot-shell-card" aria-label="T3 Code splash screen">
        <img id="boot-shell-logo" src="/apple-touch-icon.png" alt="T3 Code" />
      </div>
    </div>
  );
}
