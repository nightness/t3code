import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ThreadGroupHeader } from "./ThreadGroupHeader";
import type { ThreadGroup } from "./threadGroups.logic";

function render(
  group: ThreadGroup,
  overrides: { dragging?: boolean; isDropTarget?: boolean } = {},
) {
  return renderToStaticMarkup(
    <ThreadGroupHeader
      group={group}
      count={3}
      renaming={false}
      dragging={overrides.dragging ?? false}
      isDropTarget={overrides.isDropTarget ?? false}
      onToggle={() => {}}
      onCommitRename={() => {}}
      onCancelRename={() => {}}
      onContextMenu={() => {}}
    />,
  );
}

const group: ThreadGroup = { id: "g1", name: "Perf", collapsed: false, threadKeys: [] };

describe("ThreadGroupHeader", () => {
  it("reads like a shelf header: muted at rest, the name alone while expanded", () => {
    const html = render(group);
    expect(html).toContain("text-sidebar-muted-foreground/60");
    expect(html).toContain(">Perf<");
    expect(html).not.toContain("(3)");
  });

  it("shows the member count only while collapsed, as the Settled shelf does", () => {
    expect(render({ ...group, collapsed: true })).toContain(">Perf (3)<");
  });

  it("reads at full strength while dragging and takes the accent over the drop target", () => {
    expect(render(group, { dragging: true })).toContain("text-sidebar-foreground/80");
    expect(render(group, { dragging: true, isDropTarget: true })).toContain("text-primary");
  });
});
