// End-to-end checks of the exported transcript page: `denext export` over the demo fixture,
// then the static output served as-is and loaded in headless Chromium.
//
//   deno task fixture && deno task export && deno task test
//
// The browser half needs a Chromium for playwright-core (PLAYWRIGHT_CHROMIUM, or the
// playwright cache); without one it is skipped and the static checks still run.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { contentType } from "jsr:@std/media-types@^1.0.0";
import { extname, join, resolve } from "@std/path";

const ROOT = resolve(import.meta.dirname!, "..");
const OUT = join(ROOT, "out");
const FIXTURE_ID = "demoTranscriptFixture0";
const BASE_PATH = "/transcripts";
const PAGE = `${BASE_PATH}/${FIXTURE_ID}/`;
/**
 * The eager JavaScript budget for a transcript page (uncompressed). Every island on the page is
 * deferred (the copy buttons load on interaction), so denext (3.4.4 and later) boots it with its
 * small delegated loader alone: 1,929 B measured, under a 4 KiB budget. The client runtime and
 * the island's code load on the first press.
 */
const EAGER_JS_BUDGET_BYTES = 4 * 1024;
const SCREENSHOTS = Deno.env.get("TRANSCRIPT_SCREENSHOTS");

const html = await Deno.readTextFile(join(OUT, FIXTURE_ID, "index.html"));

Deno.test("the export renders the transcript as server HTML", () => {
  assertStringIncludes(html, "Add a healthz route");
  assertStringIncludes(html, "Add a /healthz route to the server and cover it with a test.");
  assertStringIncludes(html, "claude-sonnet-4-5");
  assertStringIncludes(html, "Tokens per turn");
  assertStringIncludes(html, 'name="robots" content="noindex,nofollow"');
});

// FIXTURE_SECRETS in packages/shared/src/sessionTranscript/testFixtures.ts (that module needs
// effect, which this Deno project does not resolve), plus the Bearer token in turn 2's prompt.
const PLANTED_SECRETS = [
  "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8",
  "sk-ant-api03-Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe-dCbA",
  "s3cr3t-Pa55word",
  "stripe-live-value-0042",
  "AKIAIOSFODNN7EXAMPLE",
  "abcdefghijklmnop0123456789",
];

Deno.test("the export publishes none of the fixture's secrets", () => {
  for (const secret of PLANTED_SECRETS) assert(!html.includes(secret), `leaked ${secret}`);
  assert(!html.includes("/Users/dev"), "leaked the home directory");
});

Deno.test("copy buttons are interaction islands and the index lists no transcript", async () => {
  const islands = html.match(/data-dnx-strategy="([a-z]+)"/g) ?? [];
  assertEquals(islands.length, 4);
  assert(islands.every((strategy) => strategy === 'data-dnx-strategy="interaction"'));
  const index = await Deno.readTextFile(join(OUT, "index.html"));
  assert(!index.includes(FIXTURE_ID));
});

/** Serves `out/` the way any static host would: files, `dir/` → `dir/index.html`. */
function serveOut(): Deno.HttpServer<Deno.NetAddr> {
  return Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, async (request) => {
    let path = decodeURIComponent(new URL(request.url).pathname);
    // Mounted at the base path, as the T3 server mounts it.
    if (!path.startsWith(`${BASE_PATH}/`)) return new Response("not found", { status: 404 });
    path = path.slice(BASE_PATH.length);
    if (path.endsWith("/")) path += "index.html";
    const file = join(OUT, path);
    if (!file.startsWith(OUT)) return new Response("forbidden", { status: 403 });
    try {
      const body = await Deno.readFile(file);
      return new Response(body, {
        headers: { "content-type": contentType(extname(file)) ?? "application/octet-stream" },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
}

async function findChromium(): Promise<string | null> {
  const fromEnv = Deno.env.get("PLAYWRIGHT_CHROMIUM");
  if (fromEnv) return fromEnv;
  const home = Deno.env.get("HOME");
  if (!home) return null;
  const caches = [
    join(home, ".cache", "ms-playwright"),
    join(home, "Library", "Caches", "ms-playwright"),
  ];
  for (const cache of caches) {
    try {
      for await (const entry of Deno.readDir(cache)) {
        if (!entry.name.startsWith("chromium_headless_shell-")) continue;
        for (const candidate of [
          join(cache, entry.name, "chrome-headless-shell-linux64", "chrome-headless-shell"),
          join(cache, entry.name, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"),
          join(cache, entry.name, "chrome-headless-shell-mac-x64", "chrome-headless-shell"),
        ]) {
          if (
            await Deno.stat(candidate).then(
              () => true,
              () => false,
            )
          )
            return candidate;
        }
      }
    } catch {
      // No cache at this location.
    }
  }
  return null;
}

const chromium = await findChromium();

/** What the eager scripts weigh over the wire, gzip-compressed one file at a time. */
async function gzipSize(scripts: ReadonlyArray<{ url: string }>): Promise<number> {
  let total = 0;
  for (const script of scripts) {
    const bytes = await Deno.readFile(join(OUT, script.url.slice(BASE_PATH.length)));
    const compressed = await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    total += compressed.byteLength;
  }
  return total;
}

Deno.test({
  name: "in a browser: little eager JS, and an island hydrates only when pressed",
  ignore: chromium === null,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { chromium: launcher } = await import("npm:playwright-core@1.60.0");
    const server = serveOut();
    const origin = `http://127.0.0.1:${server.addr.port}`;
    const browser = await launcher.launch({ executablePath: chromium! });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      const page = await context.newPage();
      const scripts: Array<{ url: string; bytes: number; afterInteraction: boolean }> = [];
      let interacted = false;
      page.on("response", async (response) => {
        const url = response.url();
        if (!url.endsWith(".js")) return;
        const body = await response.body().catch(() => new Uint8Array());
        scripts.push({
          url: new URL(url).pathname,
          bytes: body.byteLength,
          afterInteraction: interacted,
        });
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));

      await page.goto(`${origin}${PAGE}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const eager = scripts.filter((script) => !script.afterInteraction);
      const eagerBytes = eager.reduce((sum, script) => sum + script.bytes, 0);
      const gzipBytes = await gzipSize(eager);
      console.log(`eager JS: ${eagerBytes} B (${gzipBytes} B gzip) in ${eager.length} files`);
      for (const script of eager) console.log(`  ${script.url} ${script.bytes} B`);
      assert(eagerBytes <= EAGER_JS_BUDGET_BYTES, `eager JS ${eagerBytes} B over budget`);
      assert(
        !eager.some((script) => script.url.includes("CopyButton")),
        "the copy island's code loaded before any interaction",
      );

      if (SCREENSHOTS) {
        await page.screenshot({ path: join(SCREENSHOTS, "desktop-light.png"), fullPage: true });
      }

      // Expanding a tool call is a native <details>: no script runs, none loads.
      const before = scripts.length;
      await page.locator("details summary").first().click();
      assert((await page.locator("details[open]").count()) === 1);
      assertEquals(scripts.length, before);

      interacted = true;
      const button = page.locator("[data-copy-button]").first();
      await button.click();
      await page.waitForFunction(
        () => document.querySelector("[data-copy-button]")?.getAttribute("aria-label") === "Copied",
      );
      assert(
        scripts.some((script) => script.afterInteraction && script.url.includes("CopyButton")),
        "pressing copy did not load the island",
      );
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assertStringIncludes(copied, "Add a /healthz route");
      const hydrated = await page.locator("[data-copy-button]").count();
      assertEquals(hydrated, 4);
      assertEquals(errors, []);

      if (SCREENSHOTS) {
        await page.emulateMedia({ colorScheme: "dark" });
        await page.reload({ waitUntil: "networkidle" });
        await page.screenshot({ path: join(SCREENSHOTS, "desktop-dark.png"), fullPage: true });
        const phone = await browser.newPage({
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
        });
        await phone.emulateMedia({ colorScheme: "dark" });
        await phone.goto(`${origin}${PAGE}`, { waitUntil: "networkidle" });
        await phone.locator("details summary").nth(1).click();
        await phone.screenshot({ path: join(SCREENSHOTS, "phone-dark.png"), fullPage: true });
      }
    } finally {
      await browser.close();
      await server.shutdown();
    }
  },
});
