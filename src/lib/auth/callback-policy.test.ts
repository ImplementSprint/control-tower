import { beforeEach, describe, expect, it, vi } from "vitest";

const membershipMocks = vi.hoisted(() => ({
  isAllowedGithubOrgMember: vi.fn(),
}));

vi.mock("@/lib/auth/github-membership", () => membershipMocks);

import { evaluateGitHubOrgPolicy } from "./callback-policy";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluateGitHubOrgPolicy", () => {
  it("allows when policy is disabled", async () => {
    await expect(
      evaluateGitHubOrgPolicy({
        enforceOrgPolicy: false,
        requiredOrgs: [],
      }),
    ).resolves.toEqual({ allowed: true });
    expect(membershipMocks.isAllowedGithubOrgMember).not.toHaveBeenCalled();
  });

  it("rejects enforced policy with no configured orgs", async () => {
    await expect(
      evaluateGitHubOrgPolicy({
        enforceOrgPolicy: true,
        requiredOrgs: [],
        providerToken: "token",
      }),
    ).resolves.toEqual({
      allowed: false,
      error: "org_policy_misconfigured",
    });
  });

  it("rejects enforced policy with no provider token", async () => {
    await expect(
      evaluateGitHubOrgPolicy({
        enforceOrgPolicy: true,
        requiredOrgs: ["ImplementSprint"],
      }),
    ).resolves.toEqual({
      allowed: false,
      error: "github_scope_missing",
    });
  });

  it("allows when any required org membership is allowed", async () => {
    membershipMocks.isAllowedGithubOrgMember
      .mockResolvedValueOnce({ allowed: false, scopeMissing: false })
      .mockResolvedValueOnce({ allowed: true, scopeMissing: false });

    await expect(
      evaluateGitHubOrgPolicy({
        enforceOrgPolicy: true,
        requiredOrgs: ["OtherOrg", "ImplementSprint"],
        providerToken: "token",
      }),
    ).resolves.toEqual({ allowed: true });
    expect(membershipMocks.isAllowedGithubOrgMember).toHaveBeenCalledTimes(2);
  });

  it("rejects when membership is denied for all configured orgs", async () => {
    membershipMocks.isAllowedGithubOrgMember.mockResolvedValue({
      allowed: false,
      scopeMissing: false,
    });

    await expect(
      evaluateGitHubOrgPolicy({
        enforceOrgPolicy: true,
        requiredOrgs: ["ImplementSprint"],
        providerToken: "token",
      }),
    ).resolves.toEqual({
      allowed: false,
      error: "github_org_not_allowed",
    });
  });

  it("returns scope missing when GitHub membership checks lack scope", async () => {
    membershipMocks.isAllowedGithubOrgMember.mockResolvedValue({
      allowed: false,
      scopeMissing: true,
    });

    await expect(
      evaluateGitHubOrgPolicy({
        enforceOrgPolicy: true,
        requiredOrgs: ["ImplementSprint"],
        providerToken: "token",
      }),
    ).resolves.toEqual({
      allowed: false,
      error: "github_scope_missing",
    });
  });
});
