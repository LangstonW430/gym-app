"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

export function Sparkline({ data, format }: { data: { x: number; y: number }[]; format: (y: number) => string }) {
  if (data.length < 2) return <p className="text-xs text-muted-foreground">Not enough sessions for a trend yet.</p>;
  return (
    <div className="h-20 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "var(--chart-grid)" }}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(_, p) => (p?.[0] ? new Date(p[0].payload.x).toLocaleDateString() : "")}
            formatter={(v) => [format(Number(v)), "e1RM"]}
          />
          <Line type="monotone" dataKey="y" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3, fill: "var(--series-1)" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
