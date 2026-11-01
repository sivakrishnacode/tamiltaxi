"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

// Served is the quiet context series (slate), missed the one to read (coral).
const config = {
  served: { label: "Got a driver", color: "var(--chart-4)" },
  missed: { label: "Missed", color: "var(--chart-1)" },
} satisfies ChartConfig;

const hh = (h: number) => String(h).padStart(2, "0");

/** Bookings per hour of day (IST), split into served and missed (GET /admin/missed → byHour). */
export function MissedHoursChart({ data }: { data: { hour: number; booked: number; missed: number }[] }) {
  const rows = data.map((d) => ({ label: `${hh(d.hour)}:00`, served: d.booked - d.missed, missed: d.missed }));
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={rows} margin={{ top: 8, left: -8, right: 8 }} barCategoryGap={2} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={2} tickFormatter={(l: string) => l.slice(0, 2)} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={<ChartTooltipContent labelFormatter={(label) => `${label}–${hh((Number(String(label).slice(0, 2)) + 1) % 24)}:00`} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="served" stackId="h" fill="var(--color-served)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} />
        <Bar dataKey="missed" stackId="h" fill="var(--color-missed)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
