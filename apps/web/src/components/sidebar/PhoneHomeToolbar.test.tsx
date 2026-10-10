import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import * as Plain from "./PhoneHomeToolbar";
import * as Android from "./PhoneHomeToolbar.android";
import * as Ios from "./PhoneHomeToolbar.ios";

const noop = () => {};

function props(overrides: Partial<Plain.PhoneHomeToolbarProps> = {}): Plain.PhoneHomeToolbarProps {
  return {
    projectScope: <button type="button" aria-label="Filter threads by project" />,
    hasProjects: true,
    searchInputRef: createRef<HTMLInputElement>(),
    searchQuery: "",
    onSearchQueryChange: noop,
    onSearchKeyDown: noop,
    onClearSearch: noop,
    searchOpen: false,
    onSearchOpenChange: noop,
    onNewThread: noop,
    newThreadDisabled: false,
    ...overrides,
  };
}

describe("PhoneHomeToolbar", () => {
  it("renders nothing on the web and desktop builds", () => {
    expect(renderToStaticMarkup(<Plain.PhoneHomeToolbar {...props()} />)).toBe("");
    expect(renderToStaticMarkup(<Plain.PhoneHomeSearchButton onPress={noop} />)).toBe("");
  });

  it("iOS: one bottom toolbar, filter then search then compose, and no Add project", () => {
    const html = renderToStaticMarkup(<Ios.PhoneHomeToolbar {...props()} />);
    const filter = html.indexOf('aria-label="Filter threads by project"');
    const search = html.indexOf('aria-label="Search threads"');
    const compose = html.indexOf('aria-label="New thread"');
    expect(filter).toBeGreaterThan(-1);
    expect(search).toBeGreaterThan(filter);
    expect(compose).toBeGreaterThan(search);
    expect(html).toContain("fixed inset-x-0 bottom-0");
    expect(html).not.toContain("Add project");
    expect(renderToStaticMarkup(<Ios.PhoneHomeSearchButton onPress={noop} />)).toBe("");
  });

  it("iOS: a query brings the clear button", () => {
    const html = renderToStaticMarkup(<Ios.PhoneHomeToolbar {...props({ searchQuery: "x" })} />);
    expect(html).toContain('aria-label="Clear thread search"');
  });

  it("Android: the New thread and filter FABs, search from the toolbar's button", () => {
    const closed = renderToStaticMarkup(<Android.PhoneHomeToolbar {...props()} />);
    expect(closed).toMatch(/aria-label="New thread"[^>]*>[\s\S]*New thread/);
    expect(closed).toContain('aria-label="Filter threads"');
    expect(closed).not.toContain('aria-label="Search threads"');
    expect(closed).not.toContain("Add project");
    const open = renderToStaticMarkup(
      <Android.PhoneHomeToolbar {...props({ searchOpen: true })} />,
    );
    expect(open).toContain('aria-label="Close search"');
    expect(open).toContain('aria-label="Search threads"');
    expect(renderToStaticMarkup(<Android.PhoneHomeSearchButton onPress={noop} />)).toContain(
      'aria-label="Search threads"',
    );
  });
});
