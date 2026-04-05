import { getAuthenticatedAccessScope, type AccessScope } from "@/lib/auth/access";
import { jsonError } from "@/lib/api/responses";

export async function requireAuthenticatedAccessScope() {
  const accessScope = await getAuthenticatedAccessScope();

  if (!accessScope) {
    return {
      accessScope: null,
      response: jsonError("Authentication is required.", 401),
    };
  }

  return {
    accessScope,
    response: null,
  };
}

export function requirePlatformAdmin(
  accessScope: AccessScope,
  message = "Only platform admins can perform this action.",
) {
  if (accessScope.isPlatformAdmin) {
    return null;
  }

  return jsonError(message, 403);
}
