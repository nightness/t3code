// The iOS and Android exports' variant of ./PhoneNewTaskSheet.tsx (denext's platform files):
// apps/mobile's NewTask sheet (features/threads/NewTaskRouteScreen.tsx, presented as the
// NewTaskSheet modal in Stack.tsx), where the phone Home's compose button starts a thread. A
// "Choose project" sheet with a grabber, an Add project button and a project search; a
// "No project" card; then one card of the projects, each row its favicon, its name in bold, its
// workspace (or "N workspaces"), and a chevron. Choosing one starts the thread there and the
// phone stack pushes its draft.
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import { Sheet } from "denext/navigation";
import {
  ChevronRightIcon,
  MessageSquareDashedIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useScratchProject } from "../../hooks/useScratchProject";
import { cn } from "../../lib/utils";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { ProjectFavicon } from "../ProjectFavicon";
import { Button } from "../ui/button";
import type { PhoneNewTaskSheetProps } from "./PhoneNewTaskSheet";
import { phoneNewTaskEntries } from "./PhoneNewTaskSheet.logic";

export type { PhoneNewTaskSheetProps } from "./PhoneNewTaskSheet";

/** A row's chevron, as apps/mobile's (14 px, the muted chevron colour). */
function Chevron() {
  return <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />;
}

export function PhoneNewTaskSheet(props: PhoneNewTaskSheetProps): ReactNode {
  const [query, setQuery] = useState("");
  const handleNewThread = useNewThreadHandler();
  const { scratchEnvironmentId, scratchWorkspaceRootFor, startScratchThread } = useScratchProject();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const scratchTarget = scratchEnvironmentId(primaryEnvironmentId ?? null);

  const entries = useMemo(
    () =>
      phoneNewTaskEntries({
        groups: props.projectGroups,
        query,
        isScratch: (project) =>
          isScratchProject(project, scratchWorkspaceRootFor(project.environmentId)),
      }),
    [props.projectGroups, query, scratchWorkspaceRootFor],
  );

  const close = () => props.onOpenChange(false);
  const start = (run: () => Promise<unknown>) => {
    close();
    void run();
  };

  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      onExitComplete={() => setQuery("")}
      detents={["large"]}
      aria-label="Choose project"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* apps/mobile's sheet header: the title centred (18 px, weight 800), Add project at the
            trailing edge; the sheet closes from the leading edge, by dragging or the backdrop. */}
        <div className="grid h-11 shrink-0 grid-cols-[3rem_1fr_3rem] items-center px-2">
          <Button aria-label="Close" size="icon" variant="ghost" onClick={close}>
            <XIcon className="size-4" />
          </Button>
          <h2 className="truncate text-center text-lg font-extrabold">Choose project</h2>
          <Button
            aria-label="Add project"
            size="icon"
            variant="ghost"
            onClick={() => {
              close();
              props.onAddProject();
            }}
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>
        <div className="shrink-0 px-5 pt-1 pb-2">
          <label className="flex h-9 items-center gap-2 rounded-xl bg-accent px-3 text-muted-foreground">
            <SearchIcon aria-hidden className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        {/* contentContainerStyle: gap 12, px 20, pt 8 (iOS). */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-2 pb-safe">
          {scratchTarget !== null && query.trim() === "" ? (
            <div className="overflow-hidden rounded-3xl bg-accent">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-foreground/5"
                onClick={() => start(() => startScratchThread(scratchTarget))}
              >
                <span className="flex size-7 shrink-0 items-center justify-center">
                  <MessageSquareDashedIcon aria-hidden className="size-4.5 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base leading-snug font-bold">No project</span>
                  <span className="block truncate text-xs leading-snug text-muted-foreground">
                    Start a task without a project
                  </span>
                </span>
                <Chevron />
              </button>
            </div>
          ) : null}
          {entries.length > 0 ? (
            <ul aria-label="Projects" className="overflow-hidden rounded-3xl bg-accent">
              {entries.map(({ group, targetProject }, index) => (
                <li key={group.projectKey} className={cn(index > 0 && "border-t border-border/70")}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-foreground/5"
                    onClick={() =>
                      start(() =>
                        handleNewThread(
                          scopeProjectRef(targetProject.environmentId, targetProject.id),
                        ),
                      )
                    }
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center">
                      <ProjectFavicon project={group} className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base leading-snug font-bold">
                        {group.displayName}
                      </span>
                      <span className="block truncate text-xs leading-snug text-muted-foreground">
                        {group.memberProjects.length > 1
                          ? `${group.memberProjects.length} workspaces`
                          : targetProject.workspaceRoot}
                      </span>
                    </span>
                    <Chevron />
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() !== "" ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No projects match “{query.trim()}”.
            </p>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
