// Web build only: react-native-nitro-markdown's `MarkdownParser` hybrid object (md4c in C++ on a
// device) in JavaScript over marked's lexer. It returns the same JSON AST the native parser
// does (react-native-nitro-markdown/src/headless.ts `MarkdownNode`), so the package's own
// JavaScript renderers draw it.
import { Lexer, type Token, type Tokens } from "marked";

interface ParserOptions {
  gfm?: boolean;
  math?: boolean;
  html?: boolean;
}

interface MarkdownNode {
  type: string;
  content?: string;
  level?: number;
  href?: string;
  title?: string;
  alt?: string;
  language?: string;
  ordered?: boolean;
  start?: number;
  checked?: boolean;
  isHeader?: boolean;
  align?: string;
  children?: MarkdownNode[];
}

/** Text with its newlines as soft breaks (md4c's paragraph line breaks). */
function textNodes(text: string): MarkdownNode[] {
  const out: MarkdownNode[] = [];
  text.split("\n").forEach((line, i) => {
    if (i > 0) out.push({ type: "soft_break" });
    if (line) out.push({ type: "text", content: line });
  });
  return out;
}

function inline(tokens: Token[] | undefined, options: ParserOptions): MarkdownNode[] {
  const out: MarkdownNode[] = [];
  for (const t of tokens ?? []) out.push(...inlineNode(t, options));
  return out;
}

function inlineNode(t: Token, options: ParserOptions): MarkdownNode[] {
  switch (t.type) {
    case "strong":
      return [{ type: "bold", children: inline((t as Tokens.Strong).tokens, options) }];
    case "em":
      return [{ type: "italic", children: inline((t as Tokens.Em).tokens, options) }];
    case "del":
      return [{ type: "strikethrough", children: inline((t as Tokens.Del).tokens, options) }];
    case "codespan":
      return [{ type: "code_inline", content: (t as Tokens.Codespan).text }];
    case "br":
      return [{ type: "line_break" }];
    case "link": {
      const l = t as Tokens.Link;
      return [
        {
          type: "link",
          href: l.href,
          title: l.title ?? undefined,
          children: inline(l.tokens, options),
        },
      ];
    }
    case "image": {
      const im = t as Tokens.Image;
      return [{ type: "image", href: im.href, title: im.title ?? undefined, alt: im.text }];
    }
    case "html":
      return options.html === false
        ? textNodes((t as Tokens.HTML).text)
        : [{ type: "html_inline", content: (t as Tokens.HTML).text }];
    case "text": {
      const tx = t as Tokens.Text;
      return tx.tokens ? inline(tx.tokens, options) : textNodes(unescape(tx.text));
    }
    case "escape":
      return [{ type: "text", content: (t as Tokens.Escape).text }];
    default:
      return "raw" in t ? textNodes(String(t.raw)) : [];
  }
}

/** marked's text entities back to characters (md4c reports the decoded text). */
function unescape(s: string): string {
  return s.replace(
    /&(amp|lt|gt|quot|#39);/g,
    (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e as "amp"],
  );
}

function blocks(
  tokens: Token[] | undefined,
  options: ParserOptions,
  tight = false,
): MarkdownNode[] {
  const out: MarkdownNode[] = [];
  for (const t of tokens ?? []) {
    const node = block(t, options, tight);
    if (node) out.push(node);
  }
  return out;
}

function block(t: Token, options: ParserOptions, tight: boolean): MarkdownNode | null {
  switch (t.type) {
    case "space":
    case "def":
      return null;
    case "heading": {
      const hd = t as Tokens.Heading;
      return { type: "heading", level: hd.depth, children: inline(hd.tokens, options) };
    }
    case "paragraph":
      return { type: "paragraph", children: inline((t as Tokens.Paragraph).tokens, options) };
    case "text": {
      // A tight list item's text is a paragraph in md4c's tree as well.
      const tx = t as Tokens.Text;
      const children = tx.tokens ? inline(tx.tokens, options) : textNodes(tx.text);
      return tight ? { type: "paragraph", children } : { type: "paragraph", children };
    }
    case "code": {
      const c = t as Tokens.Code;
      return { type: "code_block", language: c.lang || undefined, content: c.text + "\n" };
    }
    case "blockquote":
      return { type: "blockquote", children: blocks((t as Tokens.Blockquote).tokens, options) };
    case "hr":
      return { type: "horizontal_rule" };
    case "html":
      return options.html === false
        ? { type: "paragraph", children: textNodes((t as Tokens.HTML).text) }
        : { type: "html_block", content: (t as Tokens.HTML).text };
    case "list": {
      const l = t as Tokens.List;
      return {
        type: "list",
        ordered: l.ordered,
        start: l.ordered ? Number(l.start || 1) : undefined,
        children: l.items.map((item) => listItem(item, options, !l.loose)),
      };
    }
    case "table":
      return table(t as Tokens.Table, options);
    default:
      return null;
  }
}

function listItem(item: Tokens.ListItem, options: ParserOptions, tight: boolean): MarkdownNode {
  const children = blocks(
    item.tokens.filter((t) => t.type !== "checkbox"),
    options,
    tight,
  );
  return item.task
    ? { type: "task_list_item", checked: item.checked === true, children }
    : { type: "list_item", children };
}

function table(t: Tokens.Table, options: ParserOptions): MarkdownNode {
  const cell = (c: Tokens.TableCell, isHeader: boolean, i: number): MarkdownNode => ({
    type: "table_cell",
    isHeader,
    align: t.align[i] ?? undefined,
    children: inline(c.tokens, options),
  });
  return {
    type: "table",
    children: [
      {
        type: "table_head",
        children: [{ type: "table_row", children: t.header.map((c, i) => cell(c, true, i)) }],
      },
      {
        type: "table_body",
        children: t.rows.map((row) => ({
          type: "table_row",
          children: row.map((c, i) => cell(c, false, i)),
        })),
      },
    ],
  };
}

function parseTree(text: string, options: ParserOptions): MarkdownNode {
  const tokens = new Lexer({ gfm: options.gfm !== false }).lex(text);
  return { type: "document", children: blocks(tokens, options) };
}

function plainText(node: MarkdownNode): string {
  if (node.content !== undefined && node.type !== "html_block" && node.type !== "html_inline") {
    return node.content;
  }
  if (node.type === "soft_break" || node.type === "line_break") return "\n";
  const inner = (node.children ?? []).map(plainText).join("");
  const blocky = [
    "paragraph",
    "heading",
    "list_item",
    "task_list_item",
    "code_block",
    "blockquote",
  ];
  return blocky.includes(node.type) ? inner + "\n" : inner;
}

const DEFAULTS: ParserOptions = { gfm: true, math: false, html: true };

export function createMarkdownParser() {
  return {
    name: "MarkdownParser",
    parse: (text: string) => JSON.stringify(parseTree(text, DEFAULTS)),
    parseWithOptions: (text: string, options: ParserOptions) =>
      JSON.stringify(parseTree(text, { ...DEFAULTS, ...options })),
    extractPlainText: (text: string) => plainText(parseTree(text, DEFAULTS)).trim(),
    extractPlainTextWithOptions: (text: string, options: ParserOptions) =>
      plainText(parseTree(text, { ...DEFAULTS, ...options })).trim(),
    dispose: () => {},
    equals: (other: unknown) => other === undefined,
    toString: () => "MarkdownParser (web)",
  };
}
