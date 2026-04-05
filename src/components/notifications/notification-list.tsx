"use client";

import { formatRelativeTime } from "@/lib/formatters";

type Notification = {
  id: string;
  tribe: string | null;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  source_type: string | null;
  source_id: string | null;
  is_read: boolean;
  created_at: string;
};

const severityStyles: Record<string, string> = {
  critical: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
};

type Props = {
  notifications: Notification[];
  onMarkRead: (ids: string[]) => void;
  onMarkAllRead: () => void;
};

export function NotificationList({ notifications, onMarkRead, onMarkAllRead }: Props) {
  const unread = notifications.filter((n) => !n.is_read);

  if (notifications.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        No notifications yet.
      </div>
    );
  }

  return (
    <div>
      {unread.length > 0 && (
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-xs text-muted-foreground">{unread.length} unread</span>
          <button
            onClick={onMarkAllRead}
            className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
          >
            Mark all read
          </button>
        </div>
      )}
      <ul className="divide-y divide-border/40 max-h-[400px] overflow-y-auto">
        {notifications.map((n) => (
          <li
            key={n.id}
            className={`flex gap-3 px-3 py-3 transition-colors ${!n.is_read ? "bg-muted/40" : ""}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${severityStyles[n.severity] ?? severityStyles.info}`}>
                  {n.severity}
                </span>
                <p className={`text-sm leading-snug ${!n.is_read ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                  {n.title}
                </p>
              </div>
              {n.body && (
                <p className="mt-0.5 pl-[46px] text-xs text-muted-foreground line-clamp-2">
                  {n.body}
                </p>
              )}
              <div className="mt-1 pl-[46px] flex items-center gap-2 text-[11px] text-muted-foreground">
                {n.tribe && <span>{n.tribe}</span>}
                <span>{formatRelativeTime(n.created_at)}</span>
              </div>
            </div>
            {!n.is_read && (
              <button
                onClick={() => onMarkRead([n.id])}
                className="shrink-0 self-start mt-0.5 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Mark as read"
              >
                <span className="block size-1.5 rounded-full bg-current" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
