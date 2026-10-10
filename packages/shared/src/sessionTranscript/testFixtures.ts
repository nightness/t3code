/**
 * A realistic two-turn thread for session transcript tests and the renderer's
 * demo page. It deliberately contains secrets and private files, so a test
 * can prove none of them survive into a transcript.
 */
import type {
  OrchestrationV2ProjectedTurnItem,
  OrchestrationV2ThreadProjection,
  OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/** Credentials planted in the fixture. None may appear in a built transcript. */
export const FIXTURE_SECRETS = {
  githubToken: "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8",
  anthropicKey: "sk-ant-api03-Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe-dCbA",
  databasePassword: "s3cr3t-Pa55word",
  envFileValue: "stripe-live-value-0042",
  awsKey: "AKIAIOSFODNN7EXAMPLE",
} as const;

const at = (iso: string) => DateTime.makeUnsafe(iso);

/**
 * @public When the fixture transcript is exported; the renderer's fixture script
 * (apps/transcripts, outside the pnpm workspaces) cannot import effect itself.
 */
export const FIXTURE_EXPORTED_AT = at("2026-10-09T11:00:00.000Z");

const base = (
  id: string,
  runId: string | null,
  ordinal: number,
  minute: number,
  extra: { status?: string; title?: string | null; providerTurnId?: string | null } = {},
) => ({
  id,
  threadId: "thread-transcript",
  runId,
  nodeId: runId ? `node-${runId}` : null,
  providerThreadId: "pt-1",
  providerTurnId: extra.providerTurnId ?? (runId ? `turn-${runId}` : null),
  nativeItemRef: null,
  parentItemId: null,
  ordinal,
  status: extra.status ?? "completed",
  title: extra.title ?? null,
  startedAt: at(`2026-10-09T10:${String(minute).padStart(2, "0")}:00.000Z`),
  completedAt: at(`2026-10-09T10:${String(minute).padStart(2, "0")}:30.000Z`),
  updatedAt: at(`2026-10-09T10:${String(minute).padStart(2, "0")}:30.000Z`),
});

function items(): OrchestrationV2TurnItem[] {
  return [
    {
      ...base("item-u1", "run-1", 0, 0),
      type: "user_message",
      createdBy: "user",
      creationSource: "web",
      messageId: "msg-u1",
      inputIntent: "default",
      text: "Add a /healthz route to the server and cover it with a test.",
      attachments: [],
    },
    {
      ...base("item-r1", "run-1", 1, 1),
      type: "reasoning",
      text: "The server routes live in apps/server/src/http.ts. I should read it first.",
      streaming: false,
    },
    {
      ...base("item-c1", "run-1", 2, 1),
      type: "command_execution",
      input: "rg -n 'route' apps/server/src/http.ts",
      output: "42:  const routes = [\n57:  router.get('/api/status', status)",
      exitCode: 0,
    },
    {
      ...base("item-c2", "run-1", 3, 2),
      type: "command_execution",
      input: "cat .env",
      output: `STRIPE_KEY=${FIXTURE_SECRETS.envFileValue}\nDATABASE_URL=postgres://app:${FIXTURE_SECRETS.databasePassword}@db:5432/app`,
      exitCode: 0,
    },
    {
      ...base("item-c3", "run-1", 4, 2),
      type: "command_execution",
      input: "env | grep TOKEN",
      output: `GITHUB_TOKEN=${FIXTURE_SECRETS.githubToken}\nANTHROPIC_API_KEY=${FIXTURE_SECRETS.anthropicKey}`,
      exitCode: 0,
    },
    {
      ...base("item-t1", "run-1", 5, 3),
      type: "dynamic_tool",
      toolName: "Read",
      input: { file_path: "/Users/dev/project/apps/server/src/http.ts" },
      output: `export function route() {}\n// aws ${FIXTURE_SECRETS.awsKey}`,
    },
    {
      ...base("item-f1", "run-1", 6, 4),
      type: "file_change",
      fileName: "apps/server/src/http.ts",
      additions: 6,
      deletions: 0,
      diffStr:
        "@@ -55,0 +56,6 @@\n+router.get('/healthz', () =>\n+  Response.json({ ok: true }),\n+);\n",
    },
    {
      ...base("item-f2", "run-1", 7, 4),
      type: "file_change",
      fileName: ".env",
      additions: 1,
      deletions: 0,
      diffStr: `+HEALTHZ_TOKEN=${FIXTURE_SECRETS.envFileValue}`,
    },
    {
      ...base("item-a1", "run-1", 8, 5),
      type: "assistant_message",
      messageId: "msg-a1",
      text: "Added `GET /healthz` returning `{ ok: true }`.\n\n- Route in `apps/server/src/http.ts`\n- Test pending",
      streaming: false,
    },
    {
      ...base("item-u2", "run-2", 9, 10),
      type: "user_message",
      createdBy: "user",
      creationSource: "web",
      messageId: "msg-u2",
      inputIntent: "default",
      text: "Now add the test. Use Bearer abcdefghijklmnop0123456789 if it needs auth.",
      attachments: [],
    },
    {
      ...base("item-c4", "run-2", 10, 11, { status: "failed" }),
      type: "command_execution",
      input: "pnpm vitest run http.test.ts",
      output: "FAIL http.test.ts > healthz\nExpected 200, received 404",
      exitCode: 1,
    },
    {
      ...base("item-f3", "run-2", 11, 12),
      type: "file_change",
      fileName: "apps/server/src/http.test.ts",
      additions: 9,
      deletions: 0,
      diffStr:
        "@@ -0,0 +1,9 @@\n+it('answers /healthz', async () => {\n+  const response = await app.request('/healthz');\n+  expect(response.status).toBe(200);\n+});\n",
    },
    {
      ...base("item-a2", "run-2", 12, 13),
      type: "assistant_message",
      messageId: "msg-a2",
      text: "The test passes now. `pnpm vitest run http.test.ts` → 1 passed.",
      streaming: false,
    },
  ] as unknown as OrchestrationV2TurnItem[];
}

const run = (
  id: string,
  ordinal: number,
  userMessageId: string,
  minute: number,
  model: string,
) => ({
  id,
  threadId: "thread-transcript",
  ordinal,
  providerInstanceId: "claudeAgent",
  modelSelection: { instanceId: "claudeAgent", model },
  providerThreadId: "pt-1",
  userMessageId,
  rootNodeId: `node-${id}`,
  activeAttemptId: null,
  status: "completed",
  requestedAt: at(`2026-10-09T10:${String(minute).padStart(2, "0")}:00.000Z`),
  startedAt: at(`2026-10-09T10:${String(minute).padStart(2, "0")}:00.000Z`),
  completedAt: at(`2026-10-09T10:${String(minute + 5).padStart(2, "0")}:12.000Z`),
  checkpointId: null,
  contextHandoffId: null,
});

const message = (id: string, role: "user" | "assistant", text: string, runId: string) => ({
  id,
  threadId: "thread-transcript",
  runId,
  nodeId: null,
  role,
  text,
  attachments: [],
  streaming: false,
  createdBy: "user",
  creationSource: "web",
  createdAt: at("2026-10-09T10:00:00.000Z"),
  updatedAt: at("2026-10-09T10:00:00.000Z"),
});

export function makeSessionTranscriptFixtureProjection(): OrchestrationV2ThreadProjection {
  const turnItems = items();
  const visibleTurnItems = turnItems.map(
    (item, position) =>
      ({
        position,
        visibility: "local",
        sourceThreadId: item.threadId,
        sourceItemId: item.id,
        item,
      }) as OrchestrationV2ProjectedTurnItem,
  );
  return {
    thread: {
      id: "thread-transcript",
      projectId: "project-1",
      title: "Add a healthz route",
      providerInstanceId: "claudeAgent",
      modelSelection: { instanceId: "claudeAgent", model: "claude-sonnet-4-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: "t3code/healthz-route",
      worktreePath: "/Users/dev/.t3/worktrees/project/healthz",
      activeProviderThreadId: null,
      lineage: {
        rootThreadId: "thread-transcript",
        parentThreadId: null,
        relationshipToParent: null,
      },
      forkedFrom: null,
      createdBy: "user",
      creationSource: "web",
      createdAt: at("2026-10-09T10:00:00.000Z"),
      updatedAt: at("2026-10-09T10:20:00.000Z"),
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
    runs: [
      run("run-1", 1, "msg-u1", 0, "claude-sonnet-4-5"),
      run("run-2", 2, "msg-u2", 10, "claude-opus-4-1"),
    ],
    attempts: [
      { id: "attempt-1", runId: "run-1" },
      { id: "attempt-2", runId: "run-2" },
    ],
    nodes: [],
    subagents: [],
    providerSessions: [],
    providerThreads: [],
    providerTurns: [
      {
        id: "turn-run-1",
        providerThreadId: "pt-1",
        nodeId: "node-run-1",
        runAttemptId: "attempt-1",
        nativeTurnRef: null,
        ordinal: 1,
        status: "completed",
        startedAt: null,
        completedAt: null,
        turnTokenUsage: {
          usageScope: "main_agent",
          usageStatus: "complete",
          inputTokens: 48_200,
          cachedInputTokens: 31_000,
          outputTokens: 2_150,
          reasoningTokens: 640,
          hasSubagents: false,
        },
      },
      {
        id: "turn-run-2",
        providerThreadId: "pt-1",
        nodeId: "node-run-2",
        runAttemptId: "attempt-2",
        nativeTurnRef: null,
        ordinal: 2,
        status: "completed",
        startedAt: null,
        completedAt: null,
        turnTokenUsage: {
          usageScope: "main_agent",
          usageStatus: "complete",
          inputTokens: 61_900,
          cachedInputTokens: 47_500,
          outputTokens: 1_420,
          hasSubagents: false,
        },
      },
    ],
    runtimeRequests: [],
    messages: [
      message(
        "msg-u1",
        "user",
        "Add a /healthz route to the server and cover it with a test.",
        "run-1",
      ),
      message(
        "msg-u2",
        "user",
        "Now add the test. Use Bearer abcdefghijklmnop0123456789 if it needs auth.",
        "run-2",
      ),
    ],
    plans: [],
    turnItems,
    checkpointScopes: [],
    checkpoints: [],
    contextHandoffs: [],
    contextTransfers: [],
    visibleTurnItems,
    updatedAt: at("2026-10-09T10:20:00.000Z"),
  } as unknown as OrchestrationV2ThreadProjection;
}
