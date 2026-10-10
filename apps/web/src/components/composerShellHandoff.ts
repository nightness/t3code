import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { consumeShellHandoff, shellReady } from "denext/client";
import { useLayoutEffect, useRef } from "react";

/**
 * The document position of `offset` in `text` once each of its lines is a paragraph inserted at
 * `start`: one step into the first paragraph, and one more for each line break passed, which
 * becomes a paragraph boundary (close + open) where the text had one character.
 */
export function shellTextOffsetToDocPos(text: string, offset: number, start: number): number {
  const bounded = Math.max(0, Math.min(text.length, offset));
  let breaks = 0;
  for (let index = 0; index < bounded; index += 1) {
    if (text[index] === "\n") breaks += 1;
  }
  return start + 1 + bounded + breaks;
}

/**
 * Put what the user typed into the prerendered shell's composer (AppShell.static.tsx) into the
 * editor, with the caret where it was: the lines become paragraphs, after any draft text the
 * editor already holds. The transaction runs through the editor's own update path, so the draft
 * store takes the text exactly as if it had been typed here.
 *
 * @returns Whether the shell field had focus (the caller restores it once the app is visible).
 */
export function applyShellComposerText(editor: Editor, key: string): boolean {
  const typed = consumeShellHandoff(key);
  if (!typed) return false;
  if (typed.text.length === 0 || editor.isDestroyed) return typed.focused;
  const { state } = editor;
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return typed.focused;
  const lines = typed.text.split("\n");
  const nodes = lines.map((line) =>
    paragraph.create(null, line.length > 0 ? state.schema.text(line) : null),
  );
  const emptyDoc = state.doc.childCount === 1 && state.doc.textContent.length === 0;
  const from = emptyDoc ? 0 : state.doc.content.size;
  const to = emptyDoc ? state.doc.content.size : from;
  const tr = state.tr.replaceWith(from, to, nodes);
  tr.setSelection(
    TextSelection.create(
      tr.doc,
      shellTextOffsetToDocPos(typed.text, typed.selectionStart, from),
      shellTextOffsetToDocPos(typed.text, typed.selectionEnd, from),
    ),
  );
  editor.view.dispatch(tr);
  return typed.focused;
}

/**
 * The composer's half of `spa.shell` (denext.config.ts): once the editor exists, take the shell
 * composer's text and selection, then tell denext the app may replace the shell, and give the
 * editor focus back if the shell had it. Off without a key, and inert on a page without a shell
 * (every build but the denext export, the tests).
 *
 * Runs in a microtask after the editor's first commit, so the controlled-value effect has
 * finished applying the store's prompt and the inserted text reaches the store through onChange.
 *
 * @returns A ref that holds `true` from the handoff until two frames after the swap: the window
 *   in which opening a thread focuses the composer at the end (ChatView), which must not move
 *   the caret the user placed in the shell.
 */
export function useComposerShellHandoff(
  editor: Editor | null,
  key: string | undefined,
): { readonly current: boolean } {
  const takenRef = useRef(false);
  const keepCaretRef = useRef(false);
  useLayoutEffect(() => {
    if (!editor || !key || takenRef.current) return;
    takenRef.current = true;
    queueMicrotask(() => {
      const focused = editor.isDestroyed ? false : applyShellComposerText(editor, key);
      keepCaretRef.current = focused;
      void shellReady().then(() => {
        if (focused && !editor.isDestroyed) editor.view.focus();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            keepCaretRef.current = false;
          }),
        );
      });
    });
  }, [editor, key]);
  return keepCaretRef;
}
