export type MembershipBootstrapConfig = {
  isFirstUserBootstrapEnabled: boolean;
  bootstrapTribe: string;
};

const FIRST_USER_BOOTSTRAP_ENV = "AUTH_BOOTSTRAP_FIRST_USER_PLATFORM_ADMIN";
const BOOTSTRAP_TRIBE_ENV = "AUTH_BOOTSTRAP_DEFAULT_TRIBE";
const DEFAULT_BOOTSTRAP_TRIBE = "platform";

function parseBooleanFlag(value: string | undefined) {
  return (value ?? "false").trim().toLowerCase() === "true";
}

function normalizeBootstrapTribe(value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (!normalized || normalized === "*") {
    return DEFAULT_BOOTSTRAP_TRIBE;
  }

  return normalized;
}

export function resolveMembershipBootstrapConfig(): MembershipBootstrapConfig {
  return {
    isFirstUserBootstrapEnabled: parseBooleanFlag(process.env[FIRST_USER_BOOTSTRAP_ENV]),
    bootstrapTribe: normalizeBootstrapTribe(process.env[BOOTSTRAP_TRIBE_ENV]),
  };
}
