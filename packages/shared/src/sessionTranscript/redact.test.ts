import { describe, expect, it } from "vite-plus/test";

import {
  REDACTED,
  SessionTranscriptRedactor,
  globToRegExp,
  parsePrivatePathsFile,
  secretEnvValues,
} from "./redact.ts";

const redact = (text: string, options = {}) => new SessionTranscriptRedactor(options).text(text);

describe("SessionTranscriptRedactor.text", () => {
  it.each([
    ["GitHub classic token", "token ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8 here"],
    ["GitHub fine-grained token", "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz"],
    ["Anthropic key", "sk-ant-api03-Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe-dCbA"],
    ["OpenAI project key", "sk-proj-abcdefghijklmnopqrstuvwxyz012345"],
    ["Stripe live key", "sk_live_51HabcdefghijklmnopQRST"],
    ["Slack bot token", "xoxb-1234567890-abcdefghij"],
    ["AWS access key", "AKIAIOSFODNN7EXAMPLE"],
    ["Google API key", "AIzaSyA1234567890abcdefghijklmnopqrstuv"],
    ["GitLab token", "glpat-abcdefghijklmnopqrstu"],
    ["npm token", "npm_abcdefghijklmnopqrstuvwxyz0123456789"],
    [
      "JWT",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    ],
  ])("removes a %s", (_name: string, secret: string) => {
    const output = redact(`before ${secret} after`);
    expect(output).not.toContain(secret);
    expect(output).toContain(REDACTED);
    expect(output.startsWith("before ")).toBe(true);
  });

  it("removes a private key block, header to footer", () => {
    const key = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ",
      "-----END OPENSSH PRIVATE KEY-----",
    ].join("\n");
    const output = redact(`key:\n${key}\ndone`);
    expect(output).toBe(`key:\n${REDACTED}\ndone`);
  });

  it("keeps the key name of a credential assignment and removes the value", () => {
    expect(redact("export DATABASE_PASSWORD=hunter2hunter2")).toBe(
      `export DATABASE_PASSWORD=${REDACTED}`,
    );
    expect(redact('{"apiKey": "abcd-1234-efgh"}')).toBe(`{"apiKey": "${REDACTED}"}`);
    expect(redact("client_secret: 9f8e7d6c5b")).toBe(`client_secret: ${REDACTED}`);
    const chained = redact("gh auth login --with-token --token abcdef123456");
    expect(chained).toContain(`--token ${REDACTED}`);
    expect(chained).not.toContain("abcdef123456");
  });

  it("leaves numbers and literals assigned to credential-looking names", () => {
    expect(redact("max_tokens: 4096")).toBe("max_tokens: 4096");
    expect(redact("auth: true")).toBe("auth: true");
  });

  it("removes credentials embedded in a URL and authorization headers", () => {
    expect(redact("postgres://app:s3cr3t-Pa55@db:5432/app")).toBe(
      `postgres://${REDACTED}@db:5432/app`,
    );
    expect(redact("curl -H 'Authorization: Bearer abcdefghijklmnop0123'")).toContain(
      `Bearer ${REDACTED}`,
    );
  });

  it("removes long mixed-case key material but keeps git SHAs readable", () => {
    const material = "Qm9vbGVhbkFsZ2VicmFJc0Z1bkFuZEZhc3QxMjM0NTY3ODkw";
    expect(redact(`key ${material}`)).toBe(`key ${REDACTED}`);
    const sha = "3de2319520714eef7069e3bc4fbe2db4d048f70f";
    expect(redact(`commit ${sha}`)).toBe(`commit ${sha}`);
  });

  it("removes literal secret values, such as the server's own environment", () => {
    const output = redact("echo opaque-value-123456 and more", {
      secretValues: ["opaque-value-123456"],
    });
    expect(output).toBe(`echo ${REDACTED} and more`);
  });

  it("shortens the home directory to ~", () => {
    expect(redact("/Users/dev/project/file.ts", { homeDir: "/Users/dev" })).toBe(
      "~/project/file.ts",
    );
  });

  it("counts what it removed by rule", () => {
    const redactor = new SessionTranscriptRedactor();
    redactor.text("ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8 and AKIAIOSFODNN7EXAMPLE");
    expect(redactor.tally.total).toBe(2);
    expect(redactor.tally.byRule).toEqual({ "github-token": 1, "aws-access-key": 1 });
  });

  it("leaves ordinary prose alone", () => {
    const prose = "Added `GET /healthz` returning { ok: true } and a test in http.test.ts.";
    expect(redact(prose)).toBe(prose);
  });
});

describe("private files", () => {
  const redactor = new SessionTranscriptRedactor({
    workspaceRoot: "/repo",
    privatePaths: ["config/prod/**", "notes.md"],
  });

  it.each([".env", "apps/web/.env.local", "certs/server.pem", "/repo/.npmrc", "home/.ssh/config"])(
    "treats %s as private by default",
    (path: string) => expect(redactor.isPrivateFile(path)).toBe(true),
  );

  it.each([".env.example", "apps/web/.env.sample", "src/env.ts", "README.md"])(
    "treats %s as public",
    (path: string) => expect(redactor.isPrivateFile(path)).toBe(false),
  );

  it("honours user-marked globs, relative or absolute", () => {
    expect(redactor.isPrivateFile("config/prod/db.yml")).toBe(true);
    expect(redactor.isPrivateFile("/repo/config/prod/db.yml")).toBe(true);
    expect(redactor.isPrivateFile("docs/notes.md")).toBe(true);
    expect(redactor.isPrivateFile("config/dev/db.yml")).toBe(false);
  });

  it("spots a command that reads a private file", () => {
    expect(redactor.mentionsPrivateFile("cat .env")).toBe(true);
    expect(redactor.mentionsPrivateFile("source ./apps/web/.env.local && run")).toBe(true);
    expect(redactor.mentionsPrivateFile("cat .env.example")).toBe(false);
    expect(redactor.mentionsPrivateFile("ls src")).toBe(false);
  });
});

describe("helpers", () => {
  it("globToRegExp anchors slash patterns and floats basename patterns", () => {
    expect(globToRegExp("*.pem").test("a/b/c.pem")).toBe(true);
    expect(globToRegExp("secrets/").test("secrets/x/y")).toBe(true);
    expect(globToRegExp("config/*.yml").test("config/a.yml")).toBe(true);
    expect(globToRegExp("config/*.yml").test("other/config/a.yml")).toBe(false);
  });

  it("parsePrivatePathsFile skips comments, blanks and negations", () => {
    expect(parsePrivatePathsFile("# private\n\nconfig/prod/**\n!keep.md\n notes.md \n")).toEqual([
      "config/prod/**",
      "notes.md",
    ]);
  });

  it("secretEnvValues picks credential-named variables only", () => {
    expect(
      secretEnvValues({
        GITHUB_TOKEN: "ghp_valuevaluevalue",
        HOME: "/Users/dev",
        OPENAI_API_KEY: "sk-short",
        PATH: "/usr/bin:/bin",
        SHORT_SECRET: "abc",
      }),
    ).toEqual(["ghp_valuevaluevalue", "sk-short"]);
  });
});
