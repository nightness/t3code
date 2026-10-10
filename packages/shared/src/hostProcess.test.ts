import { describe, expect, it } from "@effect/vitest";

import { HostProcessIsExecutable, isSingleExecutable } from "./hostProcess.ts";

describe("isSingleExecutable", () => {
  it("is false for a script run by Node", () => {
    expect(isSingleExecutable()).toBe(false);
    expect(HostProcessIsExecutable.defaultValue()).toBe(false);
  });

  it("answers what node:sea says", () => {
    const sea = (isSea: boolean) => (id: string) =>
      id === "node:sea" ? { isSea: () => isSea } : undefined;
    expect(isSingleExecutable(sea(true))).toBe(true);
    expect(isSingleExecutable(sea(false))).toBe(false);
  });

  it("is false on a runtime without node:sea", () => {
    // Deno (a desktop app's sidecar) and Node before getBuiltinModule.
    expect(isSingleExecutable(undefined)).toBe(false);
    expect(isSingleExecutable(() => undefined)).toBe(false);
    expect(
      isSingleExecutable(() => {
        throw new Error("No such built-in module: node:sea");
      }),
    ).toBe(false);
  });
});
