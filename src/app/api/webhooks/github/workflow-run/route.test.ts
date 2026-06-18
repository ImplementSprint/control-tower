import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/alerts/dispatch", () => ({
  dispatchAlerts: vi.fn(),
}));
vi.mock("@/lib/alerts/evaluate", () => ({
  evaluateAlertRules: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({
  logEvent: vi.fn(),
}));

describe("POST /api/webhooks/github/workflow-run", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_WEBHOOK_SECRET;
  });

  it("responds to GitHub ping events", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/github/workflow-run", {
        method: "POST",
        headers: { "x-github-event": "ping" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      message: "GitHub webhook ping received.",
    });
  });

  it("ignores non workflow_run events", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/github/workflow-run", {
        method: "POST",
        headers: { "x-github-event": "push" },
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: "push" });
  });

  it("fails closed when the webhook secret is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/github/workflow-run", {
        method: "POST",
        headers: { "x-github-event": "workflow_run" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(500);
  });

  it("rejects invalid signatures", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "expected-secret";

    const response = await POST(
      new Request("http://localhost/api/webhooks/github/workflow-run", {
        method: "POST",
        headers: {
          "x-github-event": "workflow_run",
          "x-hub-signature-256": "sha256=invalid",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
  });
});
