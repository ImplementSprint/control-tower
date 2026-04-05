export type GithubTeam = {
  slug?: string | null;
  organization?: {
    login?: string | null;
  } | null;
};

export async function isAllowedGithubOrgMember(providerToken: string, org: string) {
  const response = await fetch(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(org)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${providerToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return {
      allowed: false,
      scopeMissing: false,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      allowed: false,
      scopeMissing: true,
    };
  }

  if (!response.ok) {
    throw new Error(`GitHub org membership check failed with ${response.status}`);
  }

  const payload = (await response.json()) as { state?: string };
  return {
    allowed: payload.state === "active" || payload.state === "pending",
    scopeMissing: false,
  };
}

export async function fetchGithubUserTeams(providerToken: string) {
  const response = await fetch("https://api.github.com/user/teams?per_page=100", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${providerToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    return {
      teams: [] as GithubTeam[],
      scopeMissing: true,
    };
  }

  if (!response.ok) {
    throw new Error(`GitHub team membership check failed with ${response.status}`);
  }

  const payload = (await response.json()) as GithubTeam[];

  return {
    teams: Array.isArray(payload) ? payload : [],
    scopeMissing: false,
  };
}
