type SlackBlock = Record<string, unknown>;

type AlertPayload = {
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  tribe?: string | null;
};

function severityColor(severity: AlertPayload["severity"]) {
  if (severity === "critical") return "#f43f5e";
  if (severity === "warning") return "#f59e0b";
  return "#10b981";
}

function severityEmoji(severity: AlertPayload["severity"]) {
  if (severity === "critical") return "🔴";
  if (severity === "warning") return "🟡";
  return "🟢";
}

export async function sendSlackAlert(webhookUrl: string, alert: AlertPayload): Promise<void> {
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${severityEmoji(alert.severity)} *${alert.title}*`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: alert.body,
      },
    },
  ];

  if (alert.tribe) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `Tribe: *${alert.tribe}*` },
        { type: "mrkdwn", text: `Time: ${new Date().toUTCString()}` },
      ],
    });
  }

  const payload = {
    attachments: [
      {
        color: severityColor(alert.severity),
        blocks,
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status} ${res.statusText}`);
  }
}
