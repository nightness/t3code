import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import type { Project } from "../../types";
import { phoneNewTaskEntries } from "./PhoneNewTaskSheet.logic";

const environmentId = EnvironmentId.make("env-primary");

function makeProject(id: string, title: string, workspaceRoot: string): Project {
  return {
    id: ProjectId.make(id),
    environmentId,
    title,
    workspaceRoot,
    repositoryIdentity: null,
    defaultModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5-codex" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scripts: [],
  };
}

const groups = buildSidebarProjectSnapshots({
  projects: [
    makeProject("atlas", "Atlas", "/work/atlas"),
    makeProject("ember", "Ember", "/work/ember"),
    makeProject("scratch", "Scratch", "/home/me/.t3/scratch"),
  ],
  settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
  primaryEnvironmentId: environmentId,
  resolveEnvironmentLabel: () => null,
});
const isScratch = (project: { readonly workspaceRoot: string }) =>
  project.workspaceRoot === "/home/me/.t3/scratch";
const titles = (query: string) =>
  phoneNewTaskEntries({ groups, query, isScratch }).map((entry) => entry.group.displayName);

describe("phoneNewTaskEntries", () => {
  it("lists every project but the scratch home, which has its own No project card", () => {
    expect(titles("")).toEqual(["Atlas", "Ember"]);
  });

  it("narrows by name or workspace, ignoring case and surrounding space", () => {
    expect(titles("  EMB ")).toEqual(["Ember"]);
    expect(titles("/work/at")).toEqual(["Atlas"]);
    expect(titles("nothing")).toEqual([]);
  });
});
