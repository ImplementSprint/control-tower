import { afterEach, describe, expect, it } from "vitest";
import { resolveMembershipBootstrapConfig } from "./membership-bootstrap";

const ORIGINAL_ENV = {
  AUTH_BOOTSTRAP_FIRST_USER_PLATFORM_ADMIN:
    process.env.AUTH_BOOTSTRAP_FIRST_USER_PLATFORM_ADMIN,
  AUTH_BOOTSTRAP_DEFAULT_TRIBE: process.env.AUTH_BOOTSTRAP_DEFAULT_TRIBE,
};

afterEach(() => {
  process.env.AUTH_BOOTSTRAP_FIRST_USER_PLATFORM_ADMIN =
    ORIGINAL_ENV.AUTH_BOOTSTRAP_FIRST_USER_PLATFORM_ADMIN;
  process.env.AUTH_BOOTSTRAP_DEFAULT_TRIBE = ORIGINAL_ENV.AUTH_BOOTSTRAP_DEFAULT_TRIBE;
});

describe("resolveMembershipBootstrapConfig", () => {
  it("returns disabled bootstrap with default tribe when env is unset", () => {
    process.env.AUTH_BOOTSTRAP_FIRST_USER_PLATFORM_ADMIN = "";
    process.env.AUTH_BOOTSTRAP_DEFAULT_TRIBE = "";

    const config = resolveMembershipBootstrapConfig();

    expect(config).toEqual({
      isFirstUserBootstrapEnabled: false,
      bootstrapTribe: "platform",
    });
  });

  it("enables bootstrap when flag is true", () => {
    process.env.AUTH_BOOTSTRAP_FIRST_USER_PLATFORM_ADMIN = "TRUE";
    process.env.AUTH_BOOTSTRAP_DEFAULT_TRIBE = "ops";

    const config = resolveMembershipBootstrapConfig();

    expect(config).toEqual({
      isFirstUserBootstrapEnabled: true,
      bootstrapTribe: "ops",
    });
  });

  it("falls back to default tribe when configured tribe is wildcard", () => {
    process.env.AUTH_BOOTSTRAP_FIRST_USER_PLATFORM_ADMIN = "true";
    process.env.AUTH_BOOTSTRAP_DEFAULT_TRIBE = "*";

    const config = resolveMembershipBootstrapConfig();

    expect(config.bootstrapTribe).toBe("platform");
  });
});
