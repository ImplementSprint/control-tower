import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const alertMocks = vi.hoisted(() => ({
  evaluateAlertRules: vi.fn(),
  dispatchAlerts: vi.fn(),
}));

vi.mock("@/lib/alerts/evaluate", () => ({
  evaluateAlertRules: alertMocks.evaluateAlertRules,
}));
vi.mock("@/lib/alerts/dispatch", () => ({
  dispatchAlerts: alertMocks.dispatchAlerts,
}));
vi.mock("@/lib/observability", () => ({
  logEvent: vi.fn(),
}));

describe("POST /api/alerts/evaluate", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.INGESTION_TOKEN;
  });

  it("fails closed when INGESTION_TOKEN is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/alerts/evaluate", {
        method: "POST",
        body: JSON.stringify({ tribe: "campus-one" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(alertMocks.evaluateAlertRules).not.toHaveBeenCalled();
    expect(alertMocks.dispatchAlerts).not.toHaveBeenCalled();
  });

  it("rejects mismatched bearer tokens", async () => {
    process.env.INGESTION_TOKEN = "expected-token";

    const response = await POST(
      new Request("http://localhost/api/alerts/evaluate", {
        method: "POST",
        headers: { authorization: "Bearer wrong-token" },
        body: JSON.stringify({ tribe: "campus-one" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(alertMocks.evaluateAlertRules).not.toHaveBeenCalled();
  });

  it("evaluates and dispatches alerts with the expected token", async () => {
    process.env.INGESTION_TOKEN = "expected-token";
    alertMocks.evaluateAlertRules.mockResolvedValue([{ id: "alert-1" }]);

    const response = await POST(
      new Request("http://localhost/api/alerts/evaluate", {
        method: "POST",
        headers: { authorization: "Bearer expected-token" },
        body: JSON.stringify({ tribe: "campus-one" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      evaluated: true,
      triggered: 1,
    });
    expect(alertMocks.evaluateAlertRules).toHaveBeenCalledWith("campus-one");
    expect(alertMocks.dispatchAlerts).toHaveBeenCalledWith([{ id: "alert-1" }]);
  });
});
