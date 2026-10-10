/** Shows startup failures before React can replace the boot splash. */
export function showBootError(error: unknown) {
  console.error("T3 Code failed to start.", error);
  const bootShell = document.getElementById("boot-shell");
  if (!bootShell) return;
  // The prerendered shell (AppShell.static.tsx) shows its splash, where the error goes, only on
  // the routes it has no layout for; a failed start shows it everywhere.
  document.documentElement.dataset.t3Shell = "splash";

  const content = document.createElement("div");
  content.id = "boot-error";
  content.setAttribute("role", "alert");

  const message = document.createElement("p");
  message.textContent = "T3 Code could not load.";
  content.append(message);

  if (import.meta.env.DEV && error instanceof Error) {
    const detail = document.createElement("p");
    detail.textContent = error.message;
    content.append(detail);
  }

  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => window.location.reload());
  content.append(reload);
  bootShell.replaceChildren(content);
}
