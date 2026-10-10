// Writes the demo transcript the renderer exports in development and tests: the shared
// fixture thread (secrets planted on purpose) built and redacted exactly as the server does.
// Run with `node scripts/write-fixture.ts` (Node 24 strips the types).
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

import { buildSessionTranscript } from "../../../packages/shared/src/sessionTranscript/build.ts";
import {
  FIXTURE_EXPORTED_AT,
  makeSessionTranscriptFixtureProjection,
} from "../../../packages/shared/src/sessionTranscript/testFixtures.ts";

export const FIXTURE_ID = "demoTranscriptFixture0";

const transcript = buildSessionTranscript({
  id: FIXTURE_ID,
  projection: makeSessionTranscriptFixtureProjection(),
  exportedAt: FIXTURE_EXPORTED_AT,
  pullRequest: {
    url: "https://github.com/example/project/pull/42",
    number: 42,
    title: "Add a /healthz route",
    baseBranch: "main",
    headBranch: "t3code/healthz-route",
  },
  redaction: { homeDir: "/Users/dev", workspaceRoot: "/Users/dev/project" },
  // Illustrative list rates per million tokens (input, cached input, output).
  price: (model, usage) => {
    const rates = model.includes("opus") ? [15, 1.5, 75] : [3, 0.3, 15];
    const uncached = usage.inputTokens - usage.cachedInputTokens;
    return (
      (uncached * rates[0]! +
        usage.cachedInputTokens * rates[1]! +
        usage.outputTokens * rates[2]!) /
      1e6
    );
  },
});

const target = NodeURL.fileURLToPath(new URL(`../fixtures/${FIXTURE_ID}.json`, import.meta.url));
NodeFS.writeFileSync(target, `${JSON.stringify(transcript, null, 2)}\n`);
console.log(`wrote ${target}`);
