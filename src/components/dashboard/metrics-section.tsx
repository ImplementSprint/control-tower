"use client";

import { useEffect, useState } from "react";
import { ChartWrapper } from "@/components/charts/chart-wrapper";
import { WorkflowTimelineChart } from "@/components/charts/workflow-timeline-chart";
import { SuccessRateTrend } from "@/components/charts/success-rate-trend";
import { TribeComparisonChart } from "@/components/charts/tribe-comparison-chart";
import { Skeleton } from "@/components/ui/skeleton";

type TimelinePoint = {
  date: string;
  total: number;
  success: number;
  failed: number;
  running: number;
  cancelled: number;
  avg_duration_seconds: number;
};

type TribeMetric = {
  tribe: string;
  success_rate: number;
  total_runs: number;
};

type MetricsSectionProps = {
  windowDays?: number;
};

export function MetricsSection({ windowDays = 14 }: MetricsSectionProps) {
  const [timeline, setTimeline] = useState<TimelinePoint[] | null>(null);
  const [tribes, setTribes] = useState<TribeMetric[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [timelineRes, tribesRes] = await Promise.all([
          fetch(`/api/metrics/timeline?windowDays=${windowDays}`),
          fetch(`/api/metrics/tribes?windowDays=${windowDays}`),
        ]);

        if (!timelineRes.ok || !tribesRes.ok) {
          setError("Failed to load metrics.");
          return;
        }

        const [timelineJson, tribesJson] = await Promise.all([
          timelineRes.json() as Promise<{ data: TimelinePoint[] }>,
          tribesRes.json() as Promise<{ data: TribeMetric[] }>,
        ]);

        if (!cancelled) {
          setTimeline(timelineJson.data);
          setTribes(tribesJson.data);
        }
      } catch {
        if (!cancelled) setError("Network error loading metrics.");
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [windowDays]);

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">{error}</div>
    );
  }

  if (!timeline || !tribes) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ChartWrapper title="Workflow Runs" description={`Last ${windowDays} days`}>
          <WorkflowTimelineChart data={timeline} />
        </ChartWrapper>

        <ChartWrapper title="Success Rate Trend" description="Reference lines at 70%, 85%, 95%">
          <SuccessRateTrend data={timeline} />
        </ChartWrapper>
      </div>

      {tribes.length > 0 && (
        <ChartWrapper title="Tribe Comparison" description="Success rate by tribe">
          <TribeComparisonChart data={tribes} />
        </ChartWrapper>
      )}
    </div>
  );
}
