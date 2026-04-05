type LogLevel = "info" | "warn" | "error";

function serializeDetails(details: Record<string, unknown>) {
  try {
    return JSON.stringify(details);
  } catch {
    return "{\"serialization_error\":true}";
  }
}

export function logEvent(
  level: LogLevel,
  event: string,
  details: Record<string, unknown> = {},
) {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };
  const message = serializeDetails(payload);

  if (level === "error") {
    console.error(message);
    return;
  }

  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.info(message);
}
