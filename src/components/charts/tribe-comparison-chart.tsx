"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type TribeMetric = {
  tribe: string;
  success_rate: number;
  total_runs: number;
};

type Props = { data: TribeMetric[] };

function getBarColor(rate: number) {
  if (rate >= 95) return "#10b981";
  if (rate >= 85) return "#f59e0b";
  return "#f43f5e";
}

export function TribeComparisonChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No tribe data available.
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.success_rate - a.success_rate);

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 40)}>
      <BarChart
        layout="vertical"
        data={sorted}
        margin={{ top: 4, right: 40, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="tribe"
          width={80}
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
          formatter={(value, _name, props: { payload?: TribeMetric }) => [
            `${value as number}% (${props.payload?.total_runs ?? 0} runs)`,
            "Success Rate",
          ]}
        />
        <Bar dataKey="success_rate" radius={[0, 6, 6, 0]}>
          {sorted.map((entry, i) => (
            <Cell key={i} fill={getBarColor(entry.success_rate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
