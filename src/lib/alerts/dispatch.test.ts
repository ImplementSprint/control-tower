import { describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TriggeredAlert } from "@/lib/alerts/evaluate";
import { dispatchAlerts } from "./dispatch";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/alerts/slack", () => ({
  sendSlackAlert: vi.fn(),
}));

vi.mock("@/lib/observability", () => ({
  logEvent: vi.fn(),
}));

function makeAlert(overrides: Partial<TriggeredAlert> = {}): TriggeredAlert {
  return {
    rule: {
      id: "rule-a",
      name: "Low success rate",
      tribe: "commerce",
      rule_type: "success_rate_below",
      threshold: 90,
      window_minutes: 15,
      channels: ["in_app"],
    },
    tribe: "commerce",
    title: "Low success rate: commerce",
    body: "Success rate is below threshold.",
    severity: "warning",
    ...overrides,
  };
}

describe("dispatchAlerts", () => {
  it("loads notification recipients once per tribe during dispatch", async () => {
    const from = vi.fn((table: string) => {
      if (table === "alert_channels") {
        return {
          select: () => ({
            eq: async () => ({ data: [] }),
          }),
        };
      }

      if (table === "user_tribe_membership") {
        return {
          select: () => ({
            eq: () => ({
              or: async () => ({ data: [{ user_id: "user-1" }] }),
            }),
          }),
        };
      }

      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(createSupabaseAdminClient).mockReturnValue({ from } as never);

    await dispatchAlerts([
      makeAlert({ rule: { ...makeAlert().rule, id: "rule-a" } }),
      makeAlert({ rule: { ...makeAlert().rule, id: "rule-b" } }),
    ]);

    expect(from.mock.calls.filter(([table]) => table === "user_tribe_membership")).toHaveLength(1);
  });
});
