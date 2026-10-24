"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { titleCase } from "@/lib/format";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
};
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** One series over time (e1RM, top set, volume, bodyweight). Optional second series (e.g. 7-day average). */
export function TimeLineChart({
  data,
  format,
  name,
  second,
  height = 240,
}: {
  data: { x: number; y: number; y2?: number }[];
  format: (v: number) => string;
  name: string;
  second?: { name: string };
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={shortDate}
            tick={axis}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) => format(Number(v)).replace(/ (lb|kg)$/, "")}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            labelFormatter={(t) => new Date(Number(t)).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            formatter={(v, key) => [format(Number(v)), key === "y2" ? second?.name : name]}
          />
          <Line
            type="monotone"
            dataKey="y"
            name={name}
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={data.length < 40 ? { r: 3, fill: "var(--series-1)", strokeWidth: 0 } : false}
            activeDot={{ r: 5, stroke: "var(--chart-surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {second && (
            <Line
              type="monotone"
              dataKey="y2"
              name={second.name}
              stroke="var(--series-2)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars of working sets per muscle with the 10–20 target band shaded. */
export function MuscleSetsChart({ data, band }: { data: { muscle: string; sets: number }[]; band: { min: number; max: number } }) {
  const max = Math.max(band.max + 2, ...data.map((d) => d.sets));
  return (
    <div style={{ height: Math.max(160, data.length * 30 + 30) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <ReferenceArea x1={band.min} x2={band.max} fill="var(--chart-band)" stroke="none" ifOverflow="extendDomain" />
          <XAxis type="number" domain={[0, Math.ceil(max)]} tick={axis} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="muscle" width={86} tick={axis} tickLine={false} axisLine={false} tickFormatter={titleCase} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--muted)" }}
            labelFormatter={(l) => titleCase(String(l))}
            formatter={(v) => [`${Number(v)} sets`, "This week"]}
          />
          <Bar dataKey="sets" fill="var(--series-1)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyCountChart({ data }: { data: { weekStart: number; workouts: number }[] }) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="weekStart" tickFormatter={shortDate} tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--muted)" }}
            labelFormatter={(t) => `Week of ${shortDate(Number(t))}`}
            formatter={(v) => [`${v} workouts`, ""]}
          />
          <Bar dataKey="workouts" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
