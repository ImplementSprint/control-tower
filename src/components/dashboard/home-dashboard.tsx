import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DeploymentSummary } from "@/components/dashboard/deployment-summary";
import { MetricsSection } from "@/components/dashboard/metrics-section";
import { TribeSelector } from "@/components/dashboard/tribe-selector";
import { WorkflowRunSummary } from "@/components/dashboard/workflow-run-summary";
import type { AccessScope } from "@/lib/auth/access";
import {
  filterDeployments,
  filterWorkflowRuns,
  getDeploymentMetrics,
  getDeploymentNextAction,
  getReliabilityBand,
  getRiskTone,
  getRunNextAction,
  type FocusFilter,
} from "@/lib/dashboard/home-presenters";
import type { HomeDashboardData } from "@/lib/dashboard/home-data";
import { formatRelativeTime, formatRuntime } from "@/lib/formatters";

export type DashboardTab = "summary" | "runs" | "metrics";

const tabLabels: Record<DashboardTab, string> = {
  summary: "Summary",
  runs: "Runs",
  metrics: "Metrics",
};

const focusLabels: Record<FocusFilter, string> = {
  all: "All Runs",
  new: "New Runs",
  "high-priority": "High Priority",
  "at-risk": "At Risk",
  "closing-soon": "Closing Soon",
};

type HomeDashboardProps = {
  accessScope: AccessScope;
  currentTab: DashboardTab;
  focusFilter: FocusFilter;
  hasExplicitTribeFilter: boolean;
  selectedTribes: string[];
  persistedTribeFilters?: string[];
  data: HomeDashboardData;
};

export function normalizeTab(value: string | undefined): DashboardTab {
  if (value === "runs" || value === "metrics") {
    return value;
  }

  return "summary";
}

export function normalizeFocusFilter(value: string | undefined): FocusFilter {
  if (
    value === "new" ||
    value === "high-priority" ||
    value === "at-risk" ||
    value === "closing-soon"
  ) {
    return value;
  }

  return "all";
}

export function getSelectedTribes(
  params: Record<string, string | string[] | undefined>,
  scope: AccessScope,
): string[] {
  const tribesParam = params.tribes;

  if (!tribesParam) {
    return scope.tribes;
  }

  const selected = Array.isArray(tribesParam) ? tribesParam : [tribesParam];
  const normalized = selected
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  if (scope.isPlatformAdmin) {
    return normalized;
  }

  return normalized.filter((tribe) =>
    scope.tribes.some((t) => t.toLowerCase() === tribe),
  );
}

export function hasTribeFilterParam(
  params: Record<string, string | string[] | undefined>,
) {
  return params.tribes !== undefined;
}

function buildDashboardHref(
  tab: DashboardTab,
  focus: FocusFilter,
  selectedTribes?: string[],
) {
  const query = new URLSearchParams();

  if (tab !== "summary") {
    query.set("tab", tab);
  }

  if (focus !== "all") {
    query.set("focus", focus);
  }

  if (selectedTribes && selectedTribes.length > 0) {
    selectedTribes.forEach((tribe) => {
      query.append("tribes", tribe);
    });
  }

  const encoded = query.toString();
  return encoded.length > 0 ? `/?${encoded}` : "/";
}

function getInitials(label: string | null) {
  if (!label) {
    return "CT";
  }

  const tokens = label
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  return tokens.length > 0 ? tokens.toUpperCase() : "CT";
}

export function HomeDashboard({
  accessScope,
  currentTab,
  focusFilter,
  hasExplicitTribeFilter,
  selectedTribes,
  persistedTribeFilters,
  data,
}: HomeDashboardProps) {
  const {
    deployments,
    error,
    workflowRuns,
    workflowRunsError,
    tribeHealth,
    tribeHealthError,
  } = data;
  const filteredDeployments = filterDeployments(deployments, focusFilter);
  const filteredWorkflowRuns = filterWorkflowRuns(workflowRuns, focusFilter);
  const metrics = getDeploymentMetrics(deployments);
  const reliabilityBand = getReliabilityBand(metrics.successRate);
  const hasTribeAccess = accessScope.isPlatformAdmin || accessScope.tribes.length > 0;

  const profileName =
    accessScope.githubDisplayName ??
    accessScope.githubUsername ??
    accessScope.email ??
    "Control Tower User";
  const profileHandle = accessScope.githubUsername
    ? `@${accessScope.githubUsername}`
    : accessScope.email;

  let visibleTribeLabel: string;
  if (!hasExplicitTribeFilter && accessScope.isPlatformAdmin) {
    visibleTribeLabel = "All tribes";
  } else if (selectedTribes.length === 0) {
    visibleTribeLabel = "No tribes selected";
  } else if (selectedTribes.length === accessScope.tribes.length) {
    visibleTribeLabel = "All accessible tribes";
  } else {
    visibleTribeLabel = selectedTribes.join(", ");
  }

  const deploymentFocusItems =
    filteredDeployments.filter((item) => item.status === "failed" || item.status === "running")
      .length > 0
      ? filteredDeployments
          .filter((item) => item.status === "failed" || item.status === "running")
          .slice(0, 4)
      : filteredDeployments.slice(0, 4);

  const runFocusItems =
    filteredWorkflowRuns.filter((item) => item.status === "failed" || item.status === "running")
      .length > 0
      ? filteredWorkflowRuns
          .filter((item) => item.status === "failed" || item.status === "running")
          .slice(0, 4)
      : filteredWorkflowRuns.slice(0, 4);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-24 -top-20 h-80 w-80 rounded-full bg-[oklch(0.93_0.045_52_/_0.85)] blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-[oklch(0.93_0.08_124_/_0.75)] blur-3xl" />

      <main className="relative mx-auto w-full max-w-[1180px] space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">
            <LayoutDashboard className="size-4" />
            Control Tower
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 shadow-sm">
              {accessScope.githubAvatarUrl ? (
                <span
                  role="img"
                  aria-label={profileName}
                  className="size-8 rounded-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${accessScope.githubAvatarUrl})` }}
                />
              ) : (
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">
                  {getInitials(profileName)}
                </span>
              )}
              <div className="leading-tight">
                <p className="text-sm font-medium text-foreground">{profileName}</p>
                <p className="text-xs text-muted-foreground">{profileHandle}</p>
              </div>
            </div>

            {accessScope.githubProfileUrl ? (
              <a
                href={accessScope.githubProfileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                GitHub Profile
              </a>
            ) : null}

            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center rounded-full border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Logout
              </button>
            </form>
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(tabLabels) as DashboardTab[]).map((tab) => (
              <a
                key={tab}
                href={buildDashboardHref(tab, focusFilter, persistedTribeFilters)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === currentTab
                    ? "bg-foreground text-background"
                    : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {tabLabels[tab]}
              </a>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Tribe scope: <span className="font-medium text-foreground">{visibleTribeLabel}</span>
          </p>
          {accessScope.tribes.length > 1 ? (
            <TribeSelector
              tribes={accessScope.tribes}
              selectedTribes={
                hasExplicitTribeFilter ? selectedTribes : accessScope.tribes
              }
              tab={currentTab}
              focus={focusFilter}
              clearHref={buildDashboardHref(currentTab, focusFilter)}
            />
          ) : null}
        </section>

        {!hasTribeAccess ? (
          <Alert>
            <AlertTitle>No Tribe Access Assigned</AlertTitle>
            <AlertDescription>
              Your account is authenticated but has no active tribe membership. Ask a platform admin to add your user to user_tribe_membership.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Dashboard data is unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {currentTab === "runs" && workflowRunsError ? (
          <Alert variant="destructive">
            <AlertTitle>Workflow runs are unavailable</AlertTitle>
            <AlertDescription>{workflowRunsError}</AlertDescription>
          </Alert>
        ) : null}

        {currentTab === "summary" ? (
          <DeploymentSummary metrics={metrics} reliabilityBand={reliabilityBand} />
        ) : null}

        {currentTab === "metrics" ? (
          <section className="space-y-4">
            <MetricsSection windowDays={14} />
            {tribeHealthError ? (
              <Alert variant="destructive">
                <AlertTitle>Tribe Health Unavailable</AlertTitle>
                <AlertDescription>{tribeHealthError}</AlertDescription>
              </Alert>
            ) : tribeHealth.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {tribeHealth.map((item) => (
                  <Card key={item.tribe} className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{item.tribe}</CardTitle>
                      <CardDescription>{item.totalRuns} runs in last 14 days</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <p>Success rate: <span className="font-medium text-foreground">{item.successRate}%</span></p>
                      <p>Failed runs: <span className="font-medium text-foreground">{item.failedRuns}</span></p>
                      <p>Running runs: <span className="font-medium text-foreground">{item.runningRuns}</span></p>
                      <p>Avg duration: <span className="font-medium text-foreground">{item.averageDurationSeconds}s</span></p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                {currentTab === "runs" ? "Workflow Runs" : "Delivery Pipeline"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {currentTab === "runs"
                  ? "Run telemetry with direct drill-down into run and job details."
                  : "Source of truth from webhook and sync-ingested workflow telemetry."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                Focus: {focusLabels[focusFilter]}
              </span>
              {currentTab === "runs" ? (
                <Link
                  href="/runs"
                  className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Open Runs Explorer
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(focusLabels) as FocusFilter[]).map((focus) => (
              <a
                key={focus}
                href={buildDashboardHref(currentTab, focus, persistedTribeFilters)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  focusFilter === focus
                    ? "bg-foreground text-background"
                    : "border border-border/70 bg-card text-foreground hover:bg-muted"
                }`}
              >
                {focusLabels[focus]}
              </a>
            ))}
          </div>

          {currentTab === "runs" ? (
            <WorkflowRunSummary workflowRuns={filteredWorkflowRuns} />
          ) : (
            <Card className="rounded-[28px] border-border/70 bg-card/95 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="border-b border-border/70 bg-background/65 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Repository</th>
                        <th className="px-4 py-3 font-medium">Branch</th>
                        <th className="px-4 py-3 font-medium">Duration</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Risk</th>
                        <th className="px-4 py-3 font-medium">Next Action</th>
                        <th className="px-4 py-3 font-medium">Last Activity</th>
                        <th className="px-4 py-3 font-medium">Tribe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeployments.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            No deployment rows match this filter.
                          </td>
                        </tr>
                      ) : (
                        filteredDeployments.slice(0, 20).map((deployment) => {
                          const risk = getRiskTone(deployment.status);

                          return (
                            <tr
                              key={deployment.id}
                              className="border-b border-border/60 last:border-b-0 hover:bg-background/50"
                            >
                              <td className="px-4 py-3.5 font-medium text-foreground">{deployment.repository}</td>
                              <td className="px-4 py-3.5 text-muted-foreground">{deployment.branch}</td>
                              <td className="px-4 py-3.5 text-muted-foreground">
                                {formatRuntime(deployment.duration_seconds)}
                              </td>
                              <td className="px-4 py-3.5">
                                <StatusBadge status={deployment.status} />
                              </td>
                              <td className="px-4 py-3.5">
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${risk.className}`}
                                >
                                  {risk.label}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-muted-foreground">
                                {getDeploymentNextAction(deployment)}
                              </td>
                              <td className="px-4 py-3.5 text-muted-foreground">
                                {formatRelativeTime(deployment.created_at)}
                              </td>
                              <td className="px-4 py-3.5">
                                <span className="inline-flex rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                                  {deployment.tribe ?? "unmapped"}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Operations Brief</CardTitle>
              <CardDescription>Immediate actions for run health</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {currentTab === "runs" ? (
                runFocusItems.length === 0 ? (
                  <p>No workflow runs yet. Trigger workflows to populate this view.</p>
                ) : (
                  runFocusItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border/70 bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground">{item.repository}</p>
                        <Link
                          href={`/runs/${item.id}`}
                          className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          Open run
                        </Link>
                      </div>
                      <p className="text-xs">{getRunNextAction(item)}</p>
                    </div>
                  ))
                )
              ) : deploymentFocusItems.length === 0 ? (
                <p>No deployment activity yet. Trigger workflows to populate this view.</p>
              ) : (
                deploymentFocusItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 bg-background px-3 py-2">
                    <p className="font-medium text-foreground">{item.repository}</p>
                    <p className="text-xs">{getDeploymentNextAction(item)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Reliability band: <span className="font-medium text-foreground">{reliabilityBand}</span>. Average runtime: <span className="font-medium text-foreground">{metrics.averageDuration}s</span>.
          </p>
        </section>
      </main>
    </div>
  );
}
