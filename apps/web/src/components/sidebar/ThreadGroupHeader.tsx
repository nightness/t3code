import { useState, type KeyboardEvent, type MouseEvent } from "react";

import { cn } from "~/lib/utils";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { MAX_THREAD_GROUP_NAME_LENGTH, type ThreadGroup } from "./threadGroups.logic";

/**
 * The sticky header of a user-defined thread group (sidebar beta). Same
 * geometry as the shelf headers (CollapsibleSectionHeader), with the group's
 * member count, an inline rename field and a context menu for group actions.
 */
export function ThreadGroupHeader(props: {
  readonly group: ThreadGroup;
  readonly count: number;
  readonly renaming: boolean;
  /** Accent while a lifted row would land in this group. */
  readonly isDropTarget: boolean;
  readonly onToggle: (groupId: string) => void;
  readonly onCommitRename: (groupId: string, name: string) => void;
  readonly onCancelRename: () => void;
  readonly onContextMenu: (groupId: string, position: { x: number; y: number }) => void;
}) {
  const { group } = props;
  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    props.onContextMenu(group.id, { x: event.clientX, y: event.clientY });
  };
  if (props.renaming) {
    return (
      <ThreadGroupRenameField
        initialName={group.name}
        onCommit={(name) => props.onCommitRename(group.id, name)}
        onCancel={props.onCancelRename}
      />
    );
  }
  return (
    <div onContextMenu={handleContextMenu} data-thread-group-header={group.id}>
      <CollapsibleSectionHeader
        expanded={!group.collapsed}
        tone={props.isDropTarget ? "accent" : "emphasized"}
        onClick={() => props.onToggle(group.id)}
        data-testid={`sidebar-thread-group-toggle-${group.id}`}
        accessory={
          <span
            className={cn(
              "shrink-0 text-2xs tabular-nums",
              props.isDropTarget ? "text-primary" : "text-sidebar-muted-foreground/70",
            )}
          >
            {props.count}
          </span>
        }
      >
        {group.name}
      </CollapsibleSectionHeader>
    </div>
  );
}

function ThreadGroupRenameField(props: {
  readonly initialName: string;
  readonly onCommit: (name: string) => void;
  readonly onCancel: () => void;
}) {
  const [name, setName] = useState(props.initialName);
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      props.onCommit(name);
    } else if (event.key === "Escape") {
      event.preventDefault();
      props.onCancel();
    }
  };
  return (
    <div className="flex h-8 items-center px-1">
      <input
        autoFocus
        value={name}
        maxLength={MAX_THREAD_GROUP_NAME_LENGTH}
        aria-label="Group name"
        onChange={(event) => setName(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={handleKeyDown}
        onBlur={() => props.onCommit(name)}
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-xs font-medium text-card-foreground outline-none focus:border-ring"
      />
    </div>
  );
}
