import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendSlackAlert } from "@/lib/alerts/slack";
import { logEvent } from "@/lib/observability";
import type { TriggeredAlert } from "@/lib/alerts/evaluate";

type AlertChannel = {
  id: string;
  tribe: string | null;
  channel_type: "slack_webhook" | "in_app";
  config: Record<string, unknown>;
  is_enabled: boolean;
};

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function dispatchAlerts(alerts: TriggeredAlert[]): Promise<void> {
  if (alerts.length === 0) return;

  const supabase = createSupabaseAdminClient();
  const recipientsByTribe = new Map<string, Promise<string[]>>();
  const loadRecipients = (tribe: string | null) => {
    const key = tribe ?? "__platform_admins__";
    const existing = recipientsByTribe.get(key);

    if (existing) {
      return existing;
    }

    const recipients = loadNotificationRecipients(supabase, tribe);
    recipientsByTribe.set(key, recipients);
    return recipients;
  };

  // Fetch enabled channels
  const { data: channels } = await supabase
    .from("alert_channels")
    .select("id, tribe, channel_type, config, is_enabled")
    .eq("is_enabled", true);

  const allChannels = (channels ?? []) as AlertChannel[];

  for (const alert of alerts) {
    const notifiedInAppUserIds = new Set<string>();
    const relevantChannels = allChannels.filter(
      (ch) => ch.tribe === null || ch.tribe === alert.tribe,
    );

    for (const channel of relevantChannels) {
      if (channel.channel_type === "slack_webhook") {
        const webhookUrl = typeof channel.config.url === "string" ? channel.config.url : null;
        if (!webhookUrl) continue;

        try {
          await sendSlackAlert(webhookUrl, {
            title: alert.title,
            body: alert.body,
            severity: alert.severity,
            tribe: alert.tribe,
          });
          logEvent("info", "alerts.slack_sent", { ruleId: alert.rule.id, tribe: alert.tribe });
        } catch (err) {
          logEvent("error", "alerts.slack_failed", {
            ruleId: alert.rule.id,
            error: err instanceof Error ? err.message : "unknown",
          });
        }
      }

      if (channel.channel_type === "in_app") {
        await dispatchInAppNotificationsOnce(
          supabase,
          alert,
          await loadRecipients(alert.tribe),
          notifiedInAppUserIds,
        );
      }
    }

    // Always send in-app if the rule channels list includes "in_app"
    const ruleChannels = Array.isArray(alert.rule.channels) ? alert.rule.channels : ["in_app"];
    if (ruleChannels.includes("in_app") && !relevantChannels.some((c) => c.channel_type === "in_app")) {
      await dispatchInAppNotificationsOnce(
        supabase,
        alert,
        await loadRecipients(alert.tribe),
        notifiedInAppUserIds,
      );
    }
  }
}

async function dispatchInAppNotificationsOnce(
  supabase: SupabaseAdminClient,
  alert: TriggeredAlert,
  recipientUserIds: string[],
  notifiedUserIds: Set<string>,
) {
  const pendingUserIds = recipientUserIds.filter((userId) => {
    if (notifiedUserIds.has(userId)) {
      return false;
    }

    notifiedUserIds.add(userId);
    return true;
  });

  await dispatchInAppNotifications(supabase, alert, pendingUserIds);
}

async function loadNotificationRecipients(
  supabase: SupabaseAdminClient,
  tribe: string | null,
) {
  // Find all users in the affected tribe (or all platform admins)
  let membersQuery = supabase
    .from("user_tribe_membership")
    .select("user_id")
    .eq("is_active", true);

  if (tribe) {
    membersQuery = membersQuery.or(`tribe.eq.${tribe},role.eq.platform_admin`);
  } else {
    membersQuery = membersQuery.eq("role", "platform_admin");
  }

  const { data: members } = await membersQuery;
  if (!members || members.length === 0) return [];

  return [...new Set(members.map((m) => m.user_id as string))];
}

async function dispatchInAppNotifications(
  supabase: SupabaseAdminClient,
  alert: TriggeredAlert,
  recipientUserIds: string[],
) {
  if (recipientUserIds.length === 0) return;

  const notifications = recipientUserIds.map((userId) => ({
    user_id: userId,
    tribe: alert.tribe,
    title: alert.title,
    body: alert.body,
    severity: alert.severity,
    source_type: "alert_rule",
    source_id: alert.rule.id,
  }));

  const { error } = await supabase.from("notifications").insert(notifications);

  if (error) {
    logEvent("error", "alerts.in_app_failed", { error: error.message, ruleId: alert.rule.id });
  } else {
    logEvent("info", "alerts.in_app_sent", { count: notifications.length, ruleId: alert.rule.id });
  }
}
