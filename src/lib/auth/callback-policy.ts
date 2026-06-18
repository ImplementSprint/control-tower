import { isAllowedGithubOrgMember } from "@/lib/auth/github-membership";

type EvaluateGitHubOrgPolicyInput = {
  enforceOrgPolicy: boolean;
  requiredOrgs: string[];
  providerToken?: string | null;
};

export type GitHubOrgPolicyResult =
  | { allowed: true }
  | { allowed: false; error: "org_policy_misconfigured" }
  | { allowed: false; error: "github_scope_missing" }
  | { allowed: false; error: "github_org_not_allowed" };

export async function evaluateGitHubOrgPolicy({
  enforceOrgPolicy,
  requiredOrgs,
  providerToken,
}: EvaluateGitHubOrgPolicyInput): Promise<GitHubOrgPolicyResult> {
  if (!enforceOrgPolicy) return { allowed: true };
  if (requiredOrgs.length === 0) {
    return { allowed: false, error: "org_policy_misconfigured" };
  }
  if (!providerToken) return { allowed: false, error: "github_scope_missing" };

  let sawMissingScope = false;
  for (const org of requiredOrgs) {
    const result = await isAllowedGithubOrgMember(providerToken, org);
    if (result.scopeMissing) {
      sawMissingScope = true;
      continue;
    }
    if (result.allowed) return { allowed: true };
  }

  return {
    allowed: false,
    error: sawMissingScope ? "github_scope_missing" : "github_org_not_allowed",
  };
}
