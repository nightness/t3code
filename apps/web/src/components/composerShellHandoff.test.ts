// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ShellHandoff } from "../denextClientFallback";

const handoff = vi.hoisted(() => ({ next: null as ShellHandoff | null }));
vi.mock("denext/client", () => ({
  consumeShellHandoff: () => {
    const taken = handoff.next;
    handoff.next = null;
    return taken;
  },
  shellReady: () => Promise.resolve(),
}));

const { applyShellComposerText, shellTextOffsetToDocPos } = await import("./composerShellHandoff");

const editors: Editor[] = [];
function editorWith(content: string): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit],
    content,
  });
  editors.push(editor);
  return editor;
}

function typed(text: string, selectionStart: number, selectionEnd = selectionStart): ShellHandoff {
  return { text, selectionStart, selectionEnd, focused: true, scrollTop: 0 };
}

/** The editor's text with a line per paragraph, and its selection as offsets into that text. */
function textAndSelection(editor: Editor) {
  const lines: string[] = [];
  editor.state.doc.forEach((node) => lines.push(node.textContent));
  const text = lines.join("\n");
  const offset = (pos: number) => editor.state.doc.textBetween(0, pos, "\n", "\n").length;
  const { from, to } = editor.state.selection;
  return { text, from: offset(from), to: offset(to) };
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  handoff.next = null;
});

describe("shellTextOffsetToDocPos", () => {
  it("steps into the first paragraph and across each line break's paragraph boundary", () => {
    expect(shellTextOffsetToDocPos("ab\ncd", 0, 0)).toBe(1);
    expect(shellTextOffsetToDocPos("ab\ncd", 2, 0)).toBe(3);
    expect(shellTextOffsetToDocPos("ab\ncd", 3, 0)).toBe(5);
    expect(shellTextOffsetToDocPos("ab\ncd", 5, 0)).toBe(7);
    expect(shellTextOffsetToDocPos("ab", 99, 10)).toBe(13);
  });
});

describe("applyShellComposerText", () => {
  it("fills an empty editor with the typed lines and puts the caret where it was", () => {
    const editor = editorWith("");
    handoff.next = typed("fix the flaky test\nin the build", 27);
    expect(applyShellComposerText(editor, "composer")).toBe(true);
    expect(textAndSelection(editor)).toEqual({
      text: "fix the flaky test\nin the build",
      from: 27,
      to: 27,
    });
  });

  it("keeps a selected range", () => {
    const editor = editorWith("");
    handoff.next = typed("one\ntwo\nthree", 4, 11);
    applyShellComposerText(editor, "composer");
    expect(textAndSelection(editor)).toEqual({ text: "one\ntwo\nthree", from: 4, to: 11 });
  });

  it("adds the typed text after a draft the editor already holds", () => {
    const editor = editorWith("<p>earlier draft</p>");
    handoff.next = typed("and more", 8);
    applyShellComposerText(editor, "composer");
    expect(textAndSelection(editor)).toEqual({
      text: "earlier draft\nand more",
      from: 22,
      to: 22,
    });
  });

  it("goes through the editor's update path, as typing does", () => {
    const editor = editorWith("");
    const onUpdate = vi.fn();
    editor.on("update", onUpdate);
    handoff.next = typed("hello", 5);
    applyShellComposerText(editor, "composer");
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("leaves the editor alone when nothing was typed or there is no shell", () => {
    const editor = editorWith("<p>draft</p>");
    handoff.next = { ...typed("", 0), focused: false };
    expect(applyShellComposerText(editor, "composer")).toBe(false);
    expect(applyShellComposerText(editor, "composer")).toBe(false);
    expect(textAndSelection(editor).text).toBe("draft");
  });
});
