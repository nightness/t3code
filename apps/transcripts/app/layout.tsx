import type { LayoutProps } from "denext/server";
import "./globals.css";

// T3's chrome follows the OS appearance through the `.dark` class its stylesheet keys on.
// This one-line boot script is the page's only eager JavaScript; without it the page renders
// in the light theme.
const THEME_SCRIPT =
  "<script>(()=>{const m=matchMedia('(prefers-color-scheme: dark)'),a=()=>document.documentElement.classList.toggle('dark',m.matches);a();m.addEventListener('change',a)})()</script>";

export const metadata = {
  title: "Session transcript · T3 Code",
  description:
    "A redacted T3 Code agent session: prompt, model, tools, every turn, tokens and cost.",
  // Transcripts are shared by link only; keep them out of search indexes.
  head:
    `<meta name="robots" content="noindex,nofollow">` +
    `<meta name="referrer" content="no-referrer">` +
    `<meta name="color-scheme" content="light dark">` +
    THEME_SCRIPT,
};

export default function RootLayout({ children }: LayoutProps) {
  return <div class="min-h-dvh bg-background text-foreground antialiased">{children}</div>;
}
