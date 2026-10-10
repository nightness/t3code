"use client";
// The page's only island. Used with `client:interaction`, it ships no JavaScript until a
// reader presses it: the first press hydrates it and is replayed, so that press copies.
// It copies the rendered text of the element `target` names instead of taking the text as
// a prop, so long messages are not serialised into the page twice.
import { useState } from "denext";

export function CopyButton({ target, label }: { target: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = document.getElementById(target)?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied (an insecure origin): the text stays selectable.
    }
  };
  return (
    <button
      type="button"
      data-copy-button={target}
      aria-label={copied ? "Copied" : label}
      onClick={copy}
      class="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      {copied ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-3.5"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-3.5"
          aria-hidden="true"
        >
          <path d="M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  );
}
