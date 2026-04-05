import { afterEach, describe, expect, it } from "vitest";
import { resolveAutomaticMembershipAssignments } from "./membership-sync";

const ORIGINAL_ENV = {
  GITHUB_USER_TRIBE_ROLE_MAP_JSON: process.env.GITHUB_USER_TRIBE_ROLE_MAP_JSON,
  GITHUB_TEAM_TRIBE_ROLE_MAP_JSON: process.env.GITHUB_TEAM_TRIBE_ROLE_MAP_JSON,
};

afterEach(() => {
  process.env.GITHUB_USER_TRIBE_ROLE_MAP_JSON = ORIGINAL_ENV.GITHUB_USER_TRIBE_ROLE_MAP_JSON;
  process.env.GITHUB_TEAM_TRIBE_ROLE_MAP_JSON = ORIGINAL_ENV.GITHUB_TEAM_TRIBE_ROLE_MAP_JSON;
});

describe("resolveAutomaticMembershipAssignments", () => {
  it("throws for invalid user map JSON", async () => {
    process.env.GITHUB_USER_TRIBE_ROLE_MAP_JSON = "{";
    process.env.GITHUB_TEAM_TRIBE_ROLE_MAP_JSON = "";

    await expect(
      resolveAutomaticMembershipAssignments({
        user: { email: "alice@example.com" },
        providerToken: null,
      }),
    ).rejects.toThrow("Invalid GITHUB_USER_TRIBE_ROLE_MAP_JSON JSON");
  });

  it("throws for invalid team map JSON", async () => {
    process.env.GITHUB_USER_TRIBE_ROLE_MAP_JSON = "";
    process.env.GITHUB_TEAM_TRIBE_ROLE_MAP_JSON = "{";

    await expect(
      resolveAutomaticMembershipAssignments({
        user: { email: "alice@example.com" },
        providerToken: null,
      }),
    ).rejects.toThrow("Invalid GITHUB_TEAM_TRIBE_ROLE_MAP_JSON JSON");
  });

  it("returns mapped membership from user map", async () => {
    process.env.GITHUB_USER_TRIBE_ROLE_MAP_JSON = JSON.stringify({
      "alice@example.com": { tribe: "payments", role: "lead" },
    });
    process.env.GITHUB_TEAM_TRIBE_ROLE_MAP_JSON = "";

    const result = await resolveAutomaticMembershipAssignments({
      user: { email: "alice@example.com" },
      providerToken: null,
    });

    expect(result.scopeMissing).toBe(false);
    expect(result.assignments).toEqual([{ tribe: "payments", role: "lead" }]);
  });

  it("flags missing scope when team mapping exists but token is absent", async () => {
    process.env.GITHUB_USER_TRIBE_ROLE_MAP_JSON = "";
    process.env.GITHUB_TEAM_TRIBE_ROLE_MAP_JSON = JSON.stringify({
      "org/platform": { tribe: "platform", role: "viewer" },
    });

    const result = await resolveAutomaticMembershipAssignments({
      user: { email: "alice@example.com" },
      providerToken: null,
    });

    expect(result.scopeMissing).toBe(true);
  });
});
