// @effect-diagnostics nodeBuiltinImport:off - reads the shell's module graph and the editor source as text.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import AppShell from "./AppShell.static";
import PhoneAppShell from "./AppShell.static.mobile";

const SRC = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));

/**
 * Every module a file reaches through relative imports, and every package specifier it names.
 * Type-only imports are skipped: the compiler erases them, so they put nothing in the shell.
 */
function moduleGraph(entry: string): { files: string[]; packages: Set<string> } {
  const files: string[] = [];
  const packages = new Set<string>();
  const pending = [NodePath.resolve(SRC, entry)];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (files.includes(file)) continue;
    files.push(file);
    const source = NodeFS.readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /(?:^|\n)\s*(?:import|export)(?!\s+type\b)\b[^;]*?from\s+["']([^"']+)["']/g,
    )) {
      const specifier = match[1]!;
      if (!specifier.startsWith(".")) {
        packages.add(specifier);
        continue;
      }
      const base = NodePath.resolve(NodePath.dirname(file), specifier);
      const candidates = [base, `${base}.ts`, `${base}.tsx`];
      const found = candidates.find((candidate) => {
        try {
          return NodeFS.readFileSync(candidate) !== undefined;
        } catch {
          return false;
        }
      });
      if (!found) throw new Error(`${file}: cannot resolve ${specifier}`);
      pending.push(found);
    }
  }
  return { files, packages };
}

describe("AppShell.static", () => {
  it("stays pure: React and icons only, no atoms, stores, contracts or Effect", () => {
    for (const entry of ["AppShell.static.tsx", "AppShell.static.mobile.tsx"]) {
      const { packages } = moduleGraph(entry);
      expect(
        [...packages].filter((name) => name !== "react" && name !== "lucide-react"),
        entry,
      ).toEqual([]);
    }
  });

  it("keeps the boot script free of imports, since it is inlined into index.html", () => {
    const { files, packages } = moduleGraph("appShellBoot.ts");
    expect([...packages]).toEqual([]);
    expect(files.map((file) => file.slice(SRC.length + 1)).toSorted()).toEqual([
      "appShellBoot.logic.ts",
      "appShellBoot.ts",
    ]);
  });

  it("renders one composer field that hands its text to the editor", () => {
    const html = renderToStaticMarkup(<AppShell />);
    expect(html.match(/data-denext-shell-key="composer"/g)).toHaveLength(1);
    expect(html).toMatch(/<textarea[^>]*data-denext-shell-key="composer"/);
    expect(html).toContain("Ask for changes, send follow-ups, or attach images");
  });

  it("gives the composer field the editor's own box", () => {
    const html = renderToStaticMarkup(<AppShell />);
    const editorSource = NodeFS.readFileSync(
      NodePath.resolve(SRC, "components/ComposerPromptEditorTiptap.tsx"),
      "utf8",
    );
    const editorClasses =
      "composer-tiptap -m-1 block max-h-52 min-h-19.5 overflow-y-auto p-1 whitespace-pre-wrap wrap-break-word bg-transparent leading-relaxed text-foreground focus:outline-none";
    expect(editorSource).toContain(editorClasses);
    const field = /<textarea[^>]*class="([^"]*)"/.exec(html)?.[1]?.split(" ") ?? [];
    expect(field).toEqual(expect.arrayContaining(editorClasses.split(" ")));
  });

  it("carries the boot splash for the routes it has no layout for", () => {
    const html = renderToStaticMarkup(<AppShell />);
    expect(html).toContain('id="boot-shell"');
    expect(html).toContain("[html:not([data-t3-shell=splash])_&amp;]:hidden");
  });

  it("is the boot splash alone on the phone exports", () => {
    const html = renderToStaticMarkup(<PhoneAppShell />);
    expect(html).toContain('id="boot-shell"');
    expect(html).not.toContain("data-denext-shell-key");
  });
});
