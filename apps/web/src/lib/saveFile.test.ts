import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { saveFile, saveFileFromUrl } from "./saveFile";

const anchors: Array<{ href: string; download: string; click: ReturnType<typeof vi.fn> }> = [];
const share = vi.fn<(data: ShareData) => Promise<void>>();
const canShare = vi.fn<(data: ShareData) => boolean>();
const fetchMock = vi.fn<(url: string) => Promise<Response>>();

function useShell(native: boolean) {
  vi.stubGlobal(
    "window",
    native ? { Capacitor: { isNativePlatform: () => true } } : ({} as Record<string, unknown>),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  anchors.length = 0;
  share.mockReset().mockResolvedValue(undefined);
  canShare.mockReset().mockReturnValue(true);
  fetchMock.mockReset();
  vi.stubGlobal("document", {
    createElement: () => {
      const anchor = { href: "", download: "", click: vi.fn() };
      anchors.push(anchor);
      return anchor;
    },
  });
  vi.stubGlobal("navigator", { share, canShare });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test/1");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saveFile", () => {
  it("clicks a download link in browsers and the desktop app, then revokes the URL later", async () => {
    useShell(false);
    await saveFile(new Blob(["{}"], { type: "application/json" }), "theme.json");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({ href: "blob:test/1", download: "theme.json" });
    expect(anchors[0]?.click).toHaveBeenCalledOnce();
    expect(share).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
  });

  it("shares a named file in the native shell instead of clicking a link", async () => {
    useShell(true);
    await saveFile(new Blob(["# Plan"], { type: "text/markdown" }), "plan.md");
    expect(anchors).toHaveLength(0);
    const file = share.mock.calls[0]?.[0].files?.[0];
    expect(file?.name).toBe("plan.md");
    expect(file?.type).toBe("text/markdown");
    expect(await file?.text()).toBe("# Plan");
  });

  it("treats a dismissed share sheet as done and reports other failures", async () => {
    useShell(true);
    share.mockRejectedValueOnce(new DOMException("dismissed", "AbortError"));
    await expect(saveFile(new Blob(["x"]), "a.bin")).resolves.toBeUndefined();
    share.mockRejectedValueOnce(new DOMException("no activation", "NotAllowedError"));
    await expect(saveFile(new Blob(["x"]), "a.bin")).rejects.toThrow("no activation");
  });

  it("rejects when the shell cannot share files", async () => {
    useShell(true);
    canShare.mockReturnValue(false);
    await expect(saveFile(new Blob(["x"]), "a.bin")).rejects.toThrow(
      "Saving files is not supported on this device.",
    );
    expect(share).not.toHaveBeenCalled();
  });
});

describe("saveFileFromUrl", () => {
  it("clicks the URL itself outside the native shell, without fetching", async () => {
    useShell(false);
    await saveFileFromUrl("http://host/file.txt", "file.txt");
    expect(anchors[0]).toMatchObject({ href: "http://host/file.txt", download: "file.txt" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and shares the bytes in the native shell", async () => {
    useShell(true);
    fetchMock.mockResolvedValue(new Response(new Blob(["abc"], { type: "text/plain" })));
    await saveFileFromUrl("http://host/file.txt", "file.txt");
    expect(fetchMock).toHaveBeenCalledWith("http://host/file.txt");
    expect(share.mock.calls[0]?.[0].files?.[0]?.name).toBe("file.txt");
    expect(anchors).toHaveLength(0);
  });

  it("rejects on an HTTP error in the native shell", async () => {
    useShell(true);
    fetchMock.mockResolvedValue(new Response("gone", { status: 404 }));
    await expect(saveFileFromUrl("http://host/x", "x")).rejects.toThrow("HTTP 404");
    expect(share).not.toHaveBeenCalled();
  });
});
