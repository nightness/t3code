import { describe, expect, it } from "vite-plus/test";

import { selectManagedAuthShell } from "./managedAuthShellKind";

describe("selectManagedAuthShell", () => {
  it.each([
    ["Electron", { isElectron: true, isNativeShell: false, platform: "web" }, "electron"],
    ["the iOS shell", { isElectron: false, isNativeShell: true, platform: "ios" }, "capacitor"],
    [
      "the Android shell",
      { isElectron: false, isNativeShell: true, platform: "android" },
      "capacitor",
    ],
    ["denext desktop", { isElectron: false, isNativeShell: false, platform: "desktop" }, null],
    ["a browser", { isElectron: false, isNativeShell: false, platform: "web" }, "browser"],
  ] as const)("picks the shell for %s", (_label, runtime, shell) => {
    expect(selectManagedAuthShell(runtime)).toBe(shell);
  });
});
