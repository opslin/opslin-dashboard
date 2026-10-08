"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Bell, Box, CheckCircle2, Cpu, Globe, HardDrive, Info, MemoryStick, Network, Server as ServerIcon, XCircle, type LucideIcon } from "lucide-react";
import { ChartLoading, useRecharts } from "@/components/charts/use-recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AlertEventRecord, AppOverviewMetric } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LEVEL_LABEL, RANGE_LABEL, formatBytes, formatRate, levelFor, normalizeSeverity, peakAt, timeAgo, type ChartPoint, type Insight, type Level, type Range, type ServerMetrics } from "./lib";

const COLOR = {
    cpu: "var(--opslin-info-default)",
    memory: "var(--opslin-chart-violet)",
    disk: "var(--opslin-warning-default)",
    network: "var(--opslin-success-default)",
    warn: "var(--opslin-warning-default)",
    crit: "var(--opslin-danger-default)",
};

function LevelChip({ level }: { level: Level }) {
    return (
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", level === "good" && "bg-success-muted text-success-text", level === "watch" && "bg-warning-muted text-warning-text", level === "high" && "bg-danger-muted text-danger-text")}>
            {LEVEL_LABEL[level]}
        </span>
    );
}

function Spark({ data, color, height = 44, empty = "Collecting data…" }: { data: number[]; color: string; height?: number; empty?: string }) {
    const gradient = useId();
    if (data.length < 2) return <div style={{ height }} className="flex items-center text-xs text-muted-foreground">{empty}</div>;
    const width = 240;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const xy = data.map((v, i) => [(i / (data.length - 1)) * width, height - 3 - ((v - min) / range) * (height - 8)] as const);
    const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L${width} ${height} L0 ${height} Z`;
    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Trend">
            <defs>
                <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradient})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

function ResourceCard({ icon: Icon, iconClass, title, level, value, hint, sub, spark, color, footerLeft, footerRight }: { icon: LucideIcon; iconClass: string; title: string; level: Level | null; value: string; hint?: string; sub?: React.ReactNode; spark: number[]; color: string; footerLeft: React.ReactNode; footerRight?: React.ReactNode }) {
    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-center justify-between px-5 pt-4">
                <h3 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
                    <span className={cn("flex size-8 items-center justify-center rounded-lg", iconClass)}><Icon className="size-4" aria-hidden="true" /></span>
                    {title}
                </h3>
                {level ? <LevelChip level={level} /> : null}
            </div>
            <p className="mt-3 flex items-baseline gap-2 px-5">
                <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">{value}</span>
                {hint ? <span className="text-sm text-muted-foreground">{hint}</span> : null}
            </p>
            {sub ? <div className="mt-1 px-5 text-sm text-muted-foreground">{sub}</div> : null}
            <div className="mt-2 px-4">
                <Spark data={spark} color={color} empty={level ? "Collecting data…" : "No live data"} />
            </div>
            <div className="flex items-center justify-between px-5 pb-4 pt-2 text-xs text-muted-foreground">
                <span>{footerLeft}</span>
                {footerRight ? <span>{footerRight}</span> : null}
            </div>
        </Card>
    );
}

const INSIGHT_STYLE: Record<Insight["tone"], { icon: LucideIcon; box: string }> = {
    danger: { icon: XCircle, box: "bg-danger-muted text-danger-text" },
    warning: { icon: AlertTriangle, box: "bg-warning-muted text-warning-text" },
    info: { icon: Info, box: "bg-info-muted text-info-text" },
    success: { icon: CheckCircle2, box: "bg-success-muted text-success-text" },
};

function HealthRing({ score, compact }: { score: number | null; compact?: boolean }) {
    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    const value = score ?? 0;
    const color = score === null ? "var(--border)" : score >= 85 ? "var(--opslin-success-default)" : score >= 60 ? "var(--opslin-warning-default)" : "var(--opslin-danger-default)";
    return (
        <div className={cn("relative shrink-0", compact ? "size-28" : "size-36")} role="img" aria-label={score === null ? "No health score yet" : `Health score ${score} out of 100`}>
            <svg viewBox="0 0 140 140" className="size-full -rotate-90">
                <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--muted)" strokeWidth="10" />
                <circle cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(value / 100) * circumference} ${circumference}`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("font-bold tabular-nums text-foreground", compact ? "text-3xl" : "text-4xl")}>{score ?? "—"}</span>
                <span className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>Health score</span>
            </div>
        </div>
    );
}

export const CHART_TABS = [
    { id: "cpu", label: "CPU" },
    { id: "memory", label: "Memory" },
    { id: "disk", label: "Disk" },
    { id: "network", label: "Network" },
    { id: "load", label: "Load" },
] as const;
export type ChartTab = (typeof CHART_TABS)[number]["id"];

function tickFormat(range: Range) {
    return (t: number) => {
        const d = new Date(t);
        return range === "7d" ? d.toLocaleDateString([], { month: "short", day: "numeric" }) : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };
}

export type DeployMarker = { t: number; label: string };

function UsageChart({ points, range, markers, serversLabel, initialTab, onCreateAlert, className }: { points: ChartPoint[]; range: Range; markers: DeployMarker[]; serversLabel: string; initialTab: ChartTab; onCreateAlert: (tab: ChartTab) => void; className?: string }) {
    const recharts = useRecharts();
    const [tab, setTab] = useState<ChartTab>(initialTab);
    const percent = tab === "cpu" || tab === "memory" || tab === "disk";
    const color = tab === "cpu" ? COLOR.cpu : tab === "memory" ? COLOR.memory : tab === "disk" ? COLOR.disk : COLOR.network;
    const format = tickFormat(range);
    const first = points[0]?.t ?? 0;
    const last = points[points.length - 1]?.t ?? 0;
    const visibleMarkers = markers.filter((m) => m.t >= first && m.t <= last);
    const legend = [
        { key: "series", label: tab === "network" ? "Inbound / outbound" : `${CHART_TABS.find((t) => t.id === tab)?.label} usage`, color },
        ...(percent ? [{ key: "warn", label: "Watch · 70%", color: COLOR.warn }, { key: "crit", label: "High · 90%", color: COLOR.crit }] : []),
        ...(visibleMarkers.length ? [{ key: "deploy", label: "Deploy", color: "var(--opslin-info-default)" }] : []),
    ];

    return (
        <Card className={cn("gap-0 rounded-2xl py-0 shadow-xs", className)}>
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
                <div>
                    <h2 className="text-lg font-bold text-foreground">Resource usage</h2>
                    <p className="text-sm text-muted-foreground">CPU, memory, disk, network and load over time · {serversLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div role="tablist" aria-label="Chart metric" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                        {CHART_TABS.map((item) => (
                            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={cn("rounded-md px-3.5 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", tab === item.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <Button variant="outline" onClick={() => onCreateAlert(tab)}><Bell aria-hidden="true" />Create alert</Button>
                </div>
            </div>
            <div className="h-72 px-3 pb-2 pt-4">
                {points.length < 2 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Collecting data. The chart appears after a few minutes.</div>
                ) : !recharts ? (
                    <ChartLoading className="h-full" />
                ) : (
                    <recharts.ResponsiveContainer width="100%" height="100%">
                        <recharts.AreaChart data={points} margin={{ top: 22, right: 18, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="usage-fill" x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                                </linearGradient>
                            </defs>
                            {percent ? <recharts.ReferenceArea y1={70} y2={90} fill={COLOR.warn} fillOpacity={0.07} /> : null}
                            {percent ? <recharts.ReferenceArea y1={90} y2={100} fill={COLOR.crit} fillOpacity={0.08} /> : null}
                            <recharts.CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                            <recharts.XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={format} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={48} />
                            <recharts.YAxis
                                width={percent ? 44 : 64}
                                domain={percent ? [0, 100] : [0, "auto"]}
                                ticks={percent ? [0, 25, 50, 70, 90, 100] : undefined}
                                tickFormatter={(v: number) => (percent ? `${v}%` : tab === "network" ? formatRate(v) : v.toFixed(1))}
                                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                                tickLine={false}
                                axisLine={false}
                            />
                            {percent ? <recharts.ReferenceLine y={70} stroke={COLOR.warn} strokeDasharray="4 4" /> : null}
                            {percent ? <recharts.ReferenceLine y={90} stroke={COLOR.crit} strokeDasharray="4 4" /> : null}
                            {visibleMarkers.map((marker) => (
                                <recharts.ReferenceLine key={`${marker.t}-${marker.label}`} x={marker.t} stroke="var(--opslin-info-default)" strokeWidth={1.2} strokeDasharray="4 4" label={{ value: marker.label, position: "top", fontSize: 11, fill: "var(--foreground)" }} />
                            ))}
                            <recharts.Tooltip
                                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                                content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const row = payload[0].payload as ChartPoint;
                                    return (
                                        <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                                            <p className="mb-1 text-muted-foreground">{new Date(row.t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                                            {tab === "network" ? (
                                                <>
                                                    <p className="flex justify-between gap-6"><span>Inbound</span><b className="tabular-nums">{formatRate(row.netIn)}</b></p>
                                                    <p className="flex justify-between gap-6"><span>Outbound</span><b className="tabular-nums">{formatRate(row.netOut)}</b></p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="flex justify-between gap-6"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: color }} />{CHART_TABS.find((t) => t.id === tab)?.label}</span><b className="tabular-nums">{percent ? `${Math.round(row[tab as "cpu"])}%` : row.load.toFixed(2)}</b></p>
                                                    {percent ? (
                                                        <>
                                                            <p className="flex justify-between gap-6 text-muted-foreground"><span>Warning</span><span>70%</span></p>
                                                            <p className="flex justify-between gap-6 text-muted-foreground"><span>Critical</span><span>90%</span></p>
                                                        </>
                                                    ) : null}
                                                </>
                                            )}
                                        </div>
                                    );
                                }}
                            />
                            {tab === "network" ? (
                                <>
                                    <recharts.Area isAnimationActive={false} type="monotone" dataKey="netIn" stroke={COLOR.cpu} strokeWidth={2} fill="url(#usage-fill)" />
                                    <recharts.Area isAnimationActive={false} type="monotone" dataKey="netOut" stroke={COLOR.memory} strokeWidth={2} fill="none" />
                                </>
                            ) : (
                                <recharts.Area isAnimationActive={false} type="monotone" dataKey={tab === "load" ? "load" : tab} stroke={color} strokeWidth={2} fill="url(#usage-fill)" />
                            )}
                        </recharts.AreaChart>
                    </recharts.ResponsiveContainer>
                )}
            </div>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-5 pb-4 text-xs text-muted-foreground">
                {legend.map((item) => (
                    <li key={item.key} className="flex items-center gap-2"><span className="h-0.5 w-3 rounded-full" style={{ background: item.color }} />{item.label}</li>
                ))}
            </ul>
        </Card>
    );
}

function appStatus(app: AppOverviewMetric): { label: string; className: string; dot: string } {
    if (app.healthStatus === "unhealthy") return { label: "Unhealthy", className: "bg-danger-muted text-danger-text", dot: "bg-danger" };
    if (app.healthStatus === "healthy" && app.restartCount >= 3) return { label: "Warning", className: "bg-warning-muted text-warning-text", dot: "bg-warning" };
    if (app.healthStatus === "healthy") return { label: "Healthy", className: "bg-success-muted text-success-text", dot: "bg-success" };
    return { label: "Unknown", className: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" };
}

export function Bar({ value, tone }: { value: number; tone: "info" | "violet" | "warning" | "success" | "danger" }) {
    const fill = { info: "bg-info", violet: "bg-chart-violet", warning: "bg-warning", success: "bg-success", danger: "bg-danger" }[tone];
    return (
        <span className="block h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className={cn("block h-full rounded-full", fill)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
        </span>
    );
}

export function AppsTable({ apps, limit }: { apps: AppOverviewMetric[]; limit?: number }) {
    const rows = useMemo(() => [...apps].sort((a, b) => b.cpuPercent + b.memoryPercent - (a.cpuPercent + a.memoryPercent)).slice(0, limit ?? apps.length), [apps, limit]);
    if (rows.length === 0) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No apps deployed yet.</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-xs font-medium text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">CPU</th>
                        <th className="px-3 py-2 font-medium">Memory</th>
                        <th className="px-3 py-2 font-medium">Restarts</th>
                        <th className="px-4 py-2 text-right font-medium">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {rows.map((app) => {
                        const status = appStatus(app);
                        return (
                            <tr key={app.id} className="hover:bg-muted/30">
                                <td className="px-4 py-3">
                                    <span className="flex items-center gap-2.5 font-medium text-foreground"><Globe className="size-4 text-muted-foreground" aria-hidden="true" />{app.name}</span>
                                </td>
                                <td className="px-3 py-3">
                                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", status.className)}><span className={cn("size-1.5 rounded-full", status.dot)} aria-hidden="true" />{status.label}</span>
                                </td>
                                <td className="px-3 py-3">
                                    <span className="flex items-center gap-2"><span className="w-14"><Bar value={app.cpuPercent} tone="info" /></span><span className="w-9 tabular-nums text-muted-foreground">{Math.round(app.cpuPercent)}%</span></span>
                                </td>
                                <td className="px-3 py-3">
                                    <span className="flex items-center gap-2"><span className="w-14"><Bar value={app.memoryPercent} tone="violet" /></span><span className="w-14 tabular-nums text-muted-foreground">{formatBytes(app.memoryUsed)}</span></span>
                                </td>
                                <td className="px-3 py-3 tabular-nums text-muted-foreground">{app.restartCount}</td>
                                <td className="px-4 py-3 text-right"><Link href={`/apps/${app.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">View<ArrowRight className="size-3.5" aria-hidden="true" /></Link></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

const SEVERITY: Record<string, { label: string; dot: string }> = {
    CRIT: { label: "High", dot: "bg-danger" },
    WARN: { label: "Warning", dot: "bg-warning" },
    INFO: { label: "Info", dot: "bg-info" },
};

export type OverviewProps = {
    range: Range;
    score: number | null;
    serversTotal: number;
    serversOnline: number;
    serversLabel: string;
    apps: AppOverviewMetric[];
    alerts: AlertEventRecord[] | null;
    insights: Insight[];
    current: ServerMetrics | null;
    points: ChartPoint[];
    markers: DeployMarker[];
    diskDays: number | null;
    tourStep: number;
    onOpenGuide: () => void;
    onCreateAlert: (tab: ChartTab) => void;
    onSilence: (ruleId: string) => void;
    silencing: boolean;
};

const TOUR_RING = "ring-2 ring-primary ring-offset-2 ring-offset-background";

function ActiveAlerts({ alerts, compact, onSilence, silencing }: { alerts: AlertEventRecord[] | null; compact: boolean; onSilence: (ruleId: string) => void; silencing: boolean }) {
    const list = alerts ?? [];
    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
                <h2 className="text-lg font-bold text-foreground">Active alerts</h2>
                <Link href="/alerts" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">View all alerts<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
            </div>
            {alerts === null ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">Alerts are not available on your plan.</p>
            ) : list.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-muted-foreground">
                    <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
                    No active alerts. Everything is quiet.
                </div>
            ) : compact ? (
                <ul className="divide-y px-5">
                    {list.slice(0, 4).map((event) => {
                        const severity = SEVERITY[normalizeSeverity(event.rule?.severity)];
                        const where = event.rule?.app?.name ?? event.rule?.server?.name ?? "";
                        return (
                            <li key={event.id} className="flex items-start gap-3 py-3.5">
                                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", severity.dot)} aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground">{event.rule?.metricLabel ?? "Alert"}</p>
                                    <p className="text-xs text-muted-foreground">{where ? `${where} · ` : ""}{timeAgo(event.openedAt)}</p>
                                </div>
                                {event.rule?.id ? <Button size="sm" variant="outline" disabled={silencing} onClick={() => onSilence(event.rule!.id)} aria-label={`Silence ${event.rule?.metricLabel ?? "alert"}`}>Silence</Button> : null}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2 font-medium">Severity</th>
                                <th className="px-3 py-2 font-medium">Message</th>
                                <th className="px-3 py-2 font-medium">Server / App</th>
                                <th className="px-5 py-2 text-right font-medium">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {list.slice(0, 4).map((event) => {
                                const severity = SEVERITY[normalizeSeverity(event.rule?.severity)];
                                return (
                                    <tr key={event.id}>
                                        <td className="px-5 py-3"><span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", severity.dot)} aria-hidden="true" />{severity.label}</span></td>
                                        <td className="px-3 py-3 text-foreground">{event.rule?.metricLabel ?? "Alert"}</td>
                                        <td className="px-3 py-3 text-muted-foreground">{event.rule?.app?.name ?? event.rule?.server?.name ?? "—"}</td>
                                        <td className="px-5 py-3 text-right text-muted-foreground">{timeAgo(event.openedAt)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {compact ? <p className="mt-auto flex items-center gap-2 border-t px-5 py-3 text-xs text-muted-foreground"><Bell className="size-3.5" aria-hidden="true" />Alerts help you act before an app goes down.</p> : null}
        </Card>
    );
}

const INSIGHT_BORDER: Record<Insight["tone"], string> = {
    danger: "border-l-danger",
    warning: "border-l-warning",
    info: "border-l-info",
    success: "border-l-success",
};

export function OverviewTab({ range, score, serversTotal, serversOnline, serversLabel, apps, alerts, insights, current, points, markers, diskDays, tourStep, onOpenGuide, onCreateAlert, onSilence, silencing }: OverviewProps) {
    const [showAllInsights, setShowAllInsights] = useState(false);
    const rangeLabel = RANGE_LABEL[range];
    const healthyApps = apps.filter((app) => app.healthStatus === "healthy" && app.restartCount < 3).length;
    const needAttention = apps.length - healthyApps;
    const activeAlerts = alerts ?? [];
    const problems = insights.filter((item) => item.tone === "danger" || item.tone === "warning");
    const attention = problems.length > 0 || (score !== null && score < 85);
    const tone = score === null ? "neutral" : score >= 85 && !attention ? "good" : score >= 60 ? "watch" : "high";
    const offline = serversTotal - serversOnline;

    const series = (pick: (p: ChartPoint) => number) => points.map(pick);
    const clock = (t?: number) => (t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
    const cpuPeak = peakAt(points, (p) => p.cpu);
    const memPeak = peakAt(points, (p) => p.memory);
    const diskPeak = peakAt(points, (p) => p.disk);
    const netPeak = peakAt(points, (p) => p.netIn + p.netOut);
    const worstTab: ChartTab = !current
        ? "cpu"
        : current.memory.percent >= current.cpu.percent && current.memory.percent >= current.disk.percent
          ? "memory"
          : current.disk.percent >= current.cpu.percent
            ? "disk"
            : "cpu";

    const cards = (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <ResourceCard
                icon={Cpu}
                iconClass="bg-info-muted text-info-text"
                title="CPU"
                level={current ? levelFor(current.cpu.percent) : null}
                value={current ? `${Math.round(current.cpu.percent)}%` : "—"}
                hint={current ? `of ${current.cpu.cores} ${current.cpu.cores === 1 ? "core" : "cores"}` : undefined}
                spark={series((p) => p.cpu)}
                color={COLOR.cpu}
                footerLeft={cpuPeak ? `Peak ${Math.round(cpuPeak.value)}%${attention ? ` · ${clock(cpuPeak.t)}` : ""}` : "Peak —"}
                footerRight={attention ? undefined : rangeLabel}
            />
            <ResourceCard
                icon={MemoryStick}
                iconClass="bg-chart-violet/10 text-chart-violet-text"
                title="Memory"
                level={current ? levelFor(current.memory.percent) : null}
                value={current ? (attention ? `${Math.round(current.memory.percent)}%` : formatBytes(current.memory.used)) : "—"}
                hint={current ? (attention ? `${formatBytes(current.memory.used)} of ${formatBytes(current.memory.total)}` : `of ${formatBytes(current.memory.total)} (${Math.round(current.memory.percent)}%)`) : undefined}
                spark={series((p) => p.memory)}
                color={COLOR.memory}
                footerLeft={memPeak && current ? (attention ? `Peak ${Math.round(memPeak.value)}% · ${clock(memPeak.t)}` : `Peak: ${formatBytes((memPeak.value / 100) * current.memory.total)}`) : "Peak —"}
                footerRight={attention ? undefined : rangeLabel}
            />
            <ResourceCard
                icon={HardDrive}
                iconClass="bg-warning-muted text-warning-text"
                title="Disk"
                level={current ? levelFor(current.disk.percent) : null}
                value={current ? (attention ? `${Math.round(current.disk.percent)}%` : formatBytes(current.disk.used)) : "—"}
                hint={current ? (attention ? `${formatBytes(current.disk.used)} of ${formatBytes(current.disk.total)}` : `of ${formatBytes(current.disk.total)} (${Math.round(current.disk.percent)}%)`) : undefined}
                spark={series((p) => p.disk)}
                color={current && current.disk.percent >= 90 ? COLOR.crit : COLOR.disk}
                footerLeft={diskDays && current && current.disk.percent >= 70 ? <span className="font-medium text-danger-text">Full in about {diskDays} {diskDays === 1 ? "day" : "days"}</span> : diskPeak ? `Peak ${Math.round(diskPeak.value)}%${attention ? ` · ${clock(diskPeak.t)}` : ""}` : "Peak —"}
                footerRight={attention ? undefined : rangeLabel}
            />
            <ResourceCard
                icon={Network}
                iconClass="bg-success-muted text-success-text"
                title="Network"
                level={current ? "good" : null}
                value={current ? formatRate(current.network.bytesIn + current.network.bytesOut) : "—"}
                hint={attention && current ? `${formatRate(current.network.bytesOut)} out` : undefined}
                sub={
                    !attention && current ? (
                        <span className="flex items-center gap-4">
                            <span className="flex items-center gap-1 tabular-nums"><ArrowDown className="size-3.5 text-info-text" aria-hidden="true" />{formatRate(current.network.bytesIn)}</span>
                            <span className="flex items-center gap-1 tabular-nums"><ArrowUp className="size-3.5 text-chart-violet-text" aria-hidden="true" />{formatRate(current.network.bytesOut)}</span>
                        </span>
                    ) : undefined
                }
                spark={series((p) => p.netIn + p.netOut)}
                color={COLOR.network}
                footerLeft={netPeak ? `Peak ${formatRate(netPeak.value)}${attention ? "" : ""}` : "Peak —"}
                footerRight={attention ? undefined : rangeLabel}
            />
        </div>
    );

    const topApps = (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
                <h2 className="text-lg font-bold text-foreground">Top apps by resource usage</h2>
                <Link href="/apps" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">View all apps<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
            </div>
            <AppsTable apps={apps} limit={4} />
        </Card>
    );

    if (attention) {
        const headlineCount = Math.max(1, problems.length);
        const sentence = problems.slice(0, 2).map((item) => item.short).join(" ") || "Some numbers are higher than usual.";
        const visibleInsights = showAllInsights ? insights : insights.slice(0, 3);
        const stats = [
            { label: "Servers online", value: `${serversOnline} / ${serversTotal}`, sub: offline === 0 ? "All connected" : `${offline} offline` },
            { label: "Apps healthy", value: `${healthyApps} / ${apps.length}`, sub: needAttention > 0 ? `${needAttention} ${needAttention === 1 ? "app" : "apps"} affected` : "All healthy" },
            { label: "Active alerts", value: alerts === null ? "—" : String(activeAlerts.length), sub: activeAlerts.length > 0 ? "Action needed" : "All quiet" },
        ];
        const high = tone === "high";
        return (
            <div className="space-y-5">
                <Card className={cn("gap-0 rounded-2xl py-0 shadow-xs", high ? "border-danger/30 bg-danger-muted/30" : "border-warning/30 bg-warning-muted/40", tourStep === 0 && TOUR_RING)}>
                    <div className="flex flex-col gap-6 p-5 lg:flex-row lg:items-center">
                        <div className="flex flex-1 items-center gap-5">
                            <HealthRing score={score} compact />
                            <div className="min-w-0">
                                <p className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider", high ? "text-danger-text" : "text-warning-text")}><AlertTriangle className="size-3.5" aria-hidden="true" />Attention needed</p>
                                <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{headlineCount} {headlineCount === 1 ? "thing needs" : "things need"} attention</h2>
                                <p className="mt-1.5 text-sm text-muted-foreground">{sentence}</p>
                            </div>
                        </div>
                        <dl className="grid grid-cols-3 divide-x border-t pt-4 lg:border-t-0 lg:pt-0">
                            {stats.map((stat) => (
                                <div key={stat.label} className="px-6 first:pl-0 last:pr-0">
                                    <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                                    <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{stat.value}</dd>
                                    <p className="text-xs text-muted-foreground">{stat.sub}</p>
                                </div>
                            ))}
                        </dl>
                    </div>
                </Card>

                <section aria-label="What we noticed" className={cn("rounded-2xl", tourStep === 1 && TOUR_RING)}>
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                        <h2 className="flex items-baseline gap-3 text-base font-bold text-foreground">What we noticed<span className="text-xs font-normal text-muted-foreground">Prioritized by impact</span></h2>
                        {insights.length > 3 ? (
                            <button type="button" onClick={() => setShowAllInsights((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{showAllInsights ? "Show less" : `View all insights (${insights.length})`}<ArrowRight className="size-3.5" aria-hidden="true" /></button>
                        ) : null}
                    </div>
                    <ul className="grid gap-4 lg:grid-cols-3">
                        {visibleInsights.map((insight) => {
                            const style = INSIGHT_STYLE[insight.tone];
                            const Icon = style.icon;
                            return (
                                <li key={insight.id} className={cn("flex gap-3 rounded-xl border border-l-4 bg-card p-4 shadow-xs", INSIGHT_BORDER[insight.tone])}>
                                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", style.box)}><Icon className="size-4" aria-hidden="true" /></span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-foreground">{insight.title}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{insight.body}</p>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-2">
                                        {insight.action ? <Button asChild size="sm" variant="outline"><Link href={insight.action.href}>{insight.action.label}</Link></Button> : null}
                                        {insight.secondary ? (
                                            insight.secondary.guide ? (
                                                <button type="button" onClick={onOpenGuide} className="text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{insight.secondary.label}</button>
                                            ) : (
                                                <Link href={insight.secondary.href ?? "#"} className="text-xs font-medium text-primary hover:underline">{insight.secondary.label}</Link>
                                            )
                                        ) : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>

                {cards}

                <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,1.1fr)]">
                    <div className={cn("rounded-2xl", tourStep === 2 && TOUR_RING)}>
                        <UsageChart className="h-full" points={points} range={range} markers={markers} serversLabel={serversLabel} initialTab={worstTab} onCreateAlert={onCreateAlert} />
                    </div>
                    <ActiveAlerts alerts={alerts} compact onSilence={onSilence} silencing={silencing} />
                </div>

                {topApps}
            </div>
        );
    }

    const headline = score === null ? "No data yet" : "Everything looks healthy";
    const subline = serversTotal === 0 ? "Connect a server to start monitoring." : `All ${serversTotal} ${serversTotal === 1 ? "server is" : "servers are"} online and running normally.`;
    const visibleInsights = showAllInsights ? insights : insights.slice(0, 2);

    return (
        <div className="space-y-5">
            <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <Card className={cn("gap-0 rounded-2xl py-0 shadow-xs", tourStep === 0 && TOUR_RING)}>
                    <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
                        <HealthRing score={score} />
                        <div className="min-w-0 flex-1">
                            <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
                                {tone === "good" ? <CheckCircle2 className="size-5 text-success" aria-hidden="true" /> : null}
                                {headline}
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">{subline}</p>
                            <div className="mt-5 grid grid-cols-3 gap-4 text-sm">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info-muted text-info-text"><ServerIcon className="size-4" aria-hidden="true" /></span>
                                    <div><p className="text-xl font-bold tabular-nums text-foreground">{serversOnline}</p><p className="text-xs text-muted-foreground">Servers online</p><p className="text-xs text-muted-foreground">{serversOnline} / {serversTotal}</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-muted text-success-text"><Box className="size-4" aria-hidden="true" /></span>
                                    <div><p className="text-xl font-bold tabular-nums text-foreground">{healthyApps}</p><p className="text-xs text-muted-foreground">Apps healthy</p><p className="text-xs text-muted-foreground">{apps.length} total</p></div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><Bell className="size-4" aria-hidden="true" /></span>
                                    <div><p className="text-xl font-bold tabular-nums text-foreground">{alerts === null ? "—" : activeAlerts.length}</p><p className="text-xs text-muted-foreground">Active alerts</p><Link href="/alerts" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">View alerts<ArrowRight className="size-3" aria-hidden="true" /></Link></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card className={cn("gap-0 rounded-2xl py-0 shadow-xs", tourStep === 1 && TOUR_RING)}>
                    <div className="flex items-center justify-between px-5 pt-5">
                        <h2 className="text-lg font-bold text-foreground">What we noticed</h2>
                        {insights.length > 2 ? (
                            <button type="button" onClick={() => setShowAllInsights((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{showAllInsights ? "Show less" : `View all insights (${insights.length})`}<ArrowRight className="size-3.5" aria-hidden="true" /></button>
                        ) : null}
                    </div>
                    <ul className="space-y-3 p-5">
                        {visibleInsights.map((insight) => {
                            const style = INSIGHT_STYLE[insight.tone];
                            const Icon = style.icon;
                            return (
                                <li key={insight.id} className="flex items-center gap-3 rounded-xl border p-3.5">
                                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", style.box)}><Icon className="size-5" aria-hidden="true" /></span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                                        <p className="text-xs text-muted-foreground">{insight.body}</p>
                                    </div>
                                    {insight.action ? <Button asChild size="sm" variant="outline"><Link href={insight.action.href}>{insight.action.label}</Link></Button> : null}
                                </li>
                            );
                        })}
                    </ul>
                </Card>
            </div>

            {cards}

            <div className={cn("rounded-2xl", tourStep === 2 && TOUR_RING)}>
                <UsageChart points={points} range={range} markers={markers} serversLabel={serversLabel} initialTab="cpu" onCreateAlert={onCreateAlert} />
            </div>

            <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                {topApps}
                <ActiveAlerts alerts={alerts} compact={false} onSilence={onSilence} silencing={silencing} />
            </div>
        </div>
    );
}
