"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type TimelinePoint = { date: string; success: number; total: number };
type ChartPoint = { date: string; rate: number };

type Props = { data: TimelinePoint[] };

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SuccessRateTrend({ data }: Props) {
  const chartData: ChartPoint[] = data.map((d) => ({
    date: d.date,
    rate: d.total > 0 ? Math.round((d.success / d.total) * 1000) / 10 : 0,
  }));

  if (data.every((d) => d.total === 0)) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No data for this period.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            fontSize: 12,
          }}
          formatter={(value) => [`${value as number}%`, "Success Rate"]}
          labelFormatter={(label) => formatDate(String(label))}
        />
        <ReferenceLine y={95} stroke="#10b981" strokeDasharray="4 2" strokeOpacity={0.6} label={{ value: "95%", fontSize: 10, fill: "#10b981", position: "right" }} />
        <ReferenceLine y={85} stroke="#f59e0b" strokeDasharray="4 2" strokeOpacity={0.6} label={{ value: "85%", fontSize: 10, fill: "#f59e0b", position: "right" }} />
        <ReferenceLine y={70} stroke="#f43f5e" strokeDasharray="4 2" strokeOpacity={0.6} label={{ value: "70%", fontSize: 10, fill: "#f43f5e", position: "right" }} />
        <Line
          type="monotone"
          dataKey="rate"
          name="Success Rate"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
