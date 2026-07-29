"use client";

import { ChartLoading, useRecharts } from "@/components/charts/use-recharts";
import { chartColors, colorMix } from "@/lib/design-system";

type PressureChartData = {
  time: string;
  value: number;
};

function PressureChart({
  data,
  dataKey,
  title,
  color,
  peak,
}: {
  data: PressureChartData[];
  dataKey: string;
  title: string;
  color: string;
  peak: number;
}) {
  const recharts = useRecharts();

  if (!recharts) {
    return <ChartLoading className="h-[234px]" />;
  }

  const {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceArea,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
  } = recharts;

  return (
    <div className="rounded-lg border border-border/70 bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">&lt;50%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">50-70%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-muted-foreground">70-90%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-muted-foreground">&gt;90%</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <ReferenceArea y1={90} y2={100} fill={colorMix(chartColors.danger, 10)} />
          <ReferenceArea y1={70} y2={90} fill={colorMix(chartColors.warning, 6)} />
          <ReferenceArea y1={50} y2={70} fill={colorMix(chartColors.warning, 3)} />
          <ReferenceLine y={90} stroke={chartColors.danger} strokeDasharray="3 3" strokeOpacity={0.5} />
          <ReferenceLine y={70} stroke={chartColors.warning} strokeDasharray="3 3" strokeOpacity={0.3} />
          <ReferenceLine y={50} stroke={chartColors.warning} strokeDasharray="3 3" strokeOpacity={0.2} />
          <ReferenceLine
            y={peak}
            stroke={chartColors.primary}
            strokeDasharray="5 5"
            strokeOpacity={0.6}
            label={{ value: `Peak: ${peak.toFixed(0)}%`, fill: chartColors.primary, fontSize: 10 }}
          />
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis dataKey="time" stroke={chartColors.axis} fontSize={10} tickLine={false} />
          <YAxis domain={[0, 100]} stroke={chartColors.axis} fontSize={10} tickLine={false} />
          <Tooltip
            contentStyle={{ background: chartColors.surface, border: `1px solid ${chartColors.grid}`, borderRadius: 8 }}
            labelStyle={{ color: chartColors.axis }}
            itemStyle={{ color }}
          />
          <Area type="monotone" dataKey="value" stroke={color} fill={`url(#gradient-${dataKey})`} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MonitoringCharts({
  cpuData,
  memoryData,
  cpuPeak,
  memoryPeak,
}: {
  cpuData: PressureChartData[];
  memoryData: PressureChartData[];
  cpuPeak: number;
  memoryPeak: number;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <PressureChart
        data={cpuData}
        dataKey="cpu"
        title="CPU Pressure"
        color={chartColors.info}
        peak={cpuPeak}
      />
      <PressureChart
        data={memoryData}
        dataKey="memory"
        title="Memory Pressure"
        color={chartColors.primary}
        peak={memoryPeak}
      />
    </div>
  );
}
