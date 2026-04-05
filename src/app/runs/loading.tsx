import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function RunsLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-6 sm:px-6">
      <div className="pointer-events-none absolute -left-24 -top-16 h-72 w-72 rounded-full bg-[oklch(0.94_0.06_54_/_0.8)] blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -top-12 h-80 w-80 rounded-full bg-[oklch(0.93_0.08_124_/_0.75)] blur-3xl" />

      <div className="relative mx-auto w-full max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {[80, 96, 96, 88, 80, 104].map((w, i) => (
            <Skeleton key={i} style={{ width: w }} className="h-8 rounded-full" />
          ))}
        </div>

        {/* Table */}
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border/40 pb-3 last:border-0 last:pb-0">
                <Skeleton className="h-4 w-20 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
