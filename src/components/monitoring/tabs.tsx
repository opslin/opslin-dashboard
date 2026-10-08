"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowRight, Box, ChevronRight, ExternalLink, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiRequestError, type AppOverviewMetric, type Server } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Bar } from "./overview";
import { type ServerMetrics } from "./lib";

export type ServerRow = { server: Server; live: boolean; current: ServerMetrics | null };

function Meter({ value }: { value: number }) {
    const tone = value >= 90 ? "danger" : value >= 70 ? "warning" : "info";
    return (
        <span className="flex items-center gap-2.5">
            <span className="w-9 tabular-nums text-foreground">{Math.round(value)}%</span>
            <span className="w-16"><Bar value={value} tone={tone} /></span>
        </span>
    );
}

function Count({ children }: { children: number }) {
    return <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-xs font-semibold tabular-nums text-muted-foreground">{children}</span>;
}

const FILTERS = [
    { id: "all", label: "All" },
    { id: "online", label: "Online" },
    { id: "offline", label: "Offline" },
    { id: "attention", label: "Needs attention" },
] as const;

export function ServersTab({ rows }: { rows: ServerRow[] }) {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
    const worst = (row: ServerRow) => (row.current ? Math.max(row.current.cpu.percent, row.current.memory.percent, row.current.disk.percent) : 0);
    const visible = rows
        .filter((row) => {
            const name = `${row.server.name} ${row.server.ip} ${row.server.hostname ?? ""}`.toLowerCase();
            if (query && !name.includes(query.toLowerCase())) return false;
            if (filter === "online") return row.live;
            if (filter === "offline") return !row.live;
            if (filter === "attention") return !row.live || worst(row) >= 70;
            return true;
        })
        .sort((a, b) => Number(b.live) - Number(a.live) || worst(b) - worst(a));
    const online = rows.filter((row) => row.live).length;
    const attention = rows.filter((row) => !row.live || worst(row) >= 70).length;

    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
                <div>
                    <h2 className="text-lg font-bold text-foreground">Servers<Count>{rows.length}</Count></h2>
                    <p className="text-sm text-muted-foreground">{online} online, {rows.length - online} offline, {attention} need attention</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search servers" aria-label="Search servers" className="h-9 w-56 pl-9" />
                    </div>
                    <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Filter servers">
                        {FILTERS.map((item) => (
                            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={cn("rounded-md px-3 py-1 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", filter === item.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>{item.label}</button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs font-medium text-muted-foreground">
                            <th className="px-5 py-2.5 font-medium">Server</th>
                            <th className="px-3 py-2.5 font-medium">CPU</th>
                            <th className="px-3 py-2.5 font-medium">Memory</th>
                            <th className="px-3 py-2.5 font-medium">Disk</th>
                            <th className="px-3 py-2.5 font-medium">Load</th>
                            <th className="px-3 py-2.5 font-medium">Agent</th>
                            <th className="px-3 py-2.5 font-medium">Last seen</th>
                            <th className="px-5 py-2.5"><span className="sr-only">Open</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y border-t">
                        {visible.map(({ server, live, current }) => (
                            <tr key={server.id} className={cn("hover:bg-muted/30", !live && "text-muted-foreground")}>
                                <td className="px-5 py-3.5">
                                    <Link href={`/servers/${server.id}`} className="block focus-visible:ring-2 focus-visible:ring-ring">
                                        <span className="flex items-center gap-2 font-semibold text-foreground">
                                            <span className={cn("size-2 rounded-full", live ? "bg-success" : "bg-muted-foreground")} aria-hidden="true" />
                                            {server.name || server.hostname || server.ip}
                                            {!live ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Offline</span> : null}
                                        </span>
                                        <span className="block pl-4 text-xs text-muted-foreground">{server.publicIp || server.ip}</span>
                                    </Link>
                                </td>
                                <td className="px-3 py-3.5">{current ? <Meter value={current.cpu.percent} /> : "—"}</td>
                                <td className="px-3 py-3.5">{current ? <Meter value={current.memory.percent} /> : "—"}</td>
                                <td className="px-3 py-3.5">{current ? <Meter value={current.disk.percent} /> : "—"}</td>
                                <td className="px-3 py-3.5 tabular-nums">{current ? (current.cpu.loadAvg[0] ?? 0).toFixed(2) : "—"}</td>
                                <td className="px-3 py-3.5 tabular-nums">{server.agentVersion ? `v${server.agentVersion}` : "—"}{server.agentVersionWarning ? <span className="ml-2 rounded-full bg-warning-muted px-2 py-0.5 text-[11px] font-medium text-warning-text">Update</span> : null}</td>
                                <td className="px-3 py-3.5">{live ? "Just now" : server.lastSeenAt ? `Offline since ${new Date(server.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}` : "Offline"}</td>
                                <td className="px-5 py-3.5 text-right">
                                    {live ? (
                                        <Link href={`/servers/${server.id}`} aria-label={`Open ${server.name}`} className="inline-flex text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><ChevronRight className="size-4" aria-hidden="true" /></Link>
                                    ) : (
                                        <Link href={`/servers/${server.id}`} className="rounded-md border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Reconnect</Link>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {visible.length === 0 ? (
                            <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">No servers match.</td></tr>
                        ) : null}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

function appHealth(app: AppOverviewMetric) {
    if (app.healthStatus === "unhealthy") return { label: "Unhealthy", className: "bg-danger-muted text-danger-text", dot: "bg-danger" };
    if (app.healthStatus === "healthy" && app.restartCount >= 3) return { label: "Warning", className: "bg-warning-muted text-warning-text", dot: "bg-warning" };
    if (app.healthStatus === "healthy") return { label: "Healthy", className: "bg-success-muted text-success-text", dot: "bg-success" };
    return { label: "Unknown", className: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" };
}

function LineSpark({ data }: { data: number[] }) {
    if (data.length < 2) return <span className="text-xs text-muted-foreground">No data yet</span>;
    const width = 240;
    const height = 32;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (data.length - 1)) * width).toFixed(1)} ${(height - 3 - ((v - min) / range) * (height - 6)).toFixed(1)}`).join(" ");
    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-8 w-full" role="img" aria-label="Response time trend">
            <path d={`${line} L${width} ${height} L0 ${height} Z`} fill="var(--opslin-info-default)" fillOpacity="0.1" />
            <path d={line} fill="none" stroke="var(--opslin-info-default)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

export function AppsTab({ apps }: { apps: AppOverviewMetric[] }) {
    const [selected, setSelected] = useState("");
    const app = apps.find((item) => item.id === selected) ?? apps[0];

    const summaries = useQueries({
        queries: apps.slice(0, 12).map((item) => ({
            queryKey: ["monitoring", "req-summary", item.id],
            queryFn: () => api.getRequestSummary(item.id, "1h"),
            retry: (count: number, error: unknown) => !(error instanceof ApiRequestError && error.status === 403) && count < 1,
            refetchInterval: 60_000,
        })),
    });
    const summaryById = useMemo(() => new Map(apps.slice(0, 12).map((item, index) => [item.id, summaries[index]?.data])), [apps, summaries]);
    const locked = summaries.some((query) => query.error instanceof ApiRequestError && query.error.status === 403);

    const latency = useQuery({ queryKey: ["monitoring", "req-latency", app?.id], queryFn: () => api.getRequestLatency(app!.id, "1h"), enabled: Boolean(app) && !locked, retry: false, refetchInterval: 60_000 });
    const slowest = useQuery({ queryKey: ["monitoring", "req-slowest", app?.id], queryFn: () => api.getSlowestEndpoints(app!.id, "1h"), enabled: Boolean(app) && !locked, retry: false, refetchInterval: 60_000 });

    const rpm = (id: string) => {
        const data = summaryById.get(id);
        return data ? Math.round(data.totalRequests / 60) : null;
    };
    const errorRate = (id: string) => {
        const data = summaryById.get(id);
        return data && data.totalRequests > 0 ? (data.errorRequests / data.totalRequests) * 100 : data ? 0 : null;
    };

    const selectedSummary = app ? summaryById.get(app.id) : undefined;
    const selectedError = app ? errorRate(app.id) : null;
    const p50 = latency.data?.series.at(-1)?.p50;
    const slowRows = slowest.data?.rows.slice(0, 3) ?? [];
    const sorted = useMemo(() => [...apps].sort((a, b) => b.cpuPercent + b.memoryPercent - (a.cpuPercent + a.memoryPercent)), [apps]);

    return (
        <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
            <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
                <div>
                    <h2 className="text-lg font-bold text-foreground">Apps<Count>{apps.length}</Count></h2>
                    <p className="text-sm text-muted-foreground">Running apps and their health at a glance.</p>
                </div>
                <Link href="/apps" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">Open all apps<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
            </div>
            {apps.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">No apps deployed yet.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5 font-medium">App / Server</th>
                                <th className="px-3 py-2.5 font-medium">Health</th>
                                <th className="px-3 py-2.5 font-medium">CPU</th>
                                <th className="px-3 py-2.5 font-medium">Memory</th>
                                <th className="px-3 py-2.5 font-medium">Restarts</th>
                                <th className="px-3 py-2.5 font-medium">Requests / min</th>
                                <th className="px-3 py-2.5 font-medium">Error rate</th>
                                <th className="px-5 py-2.5"><span className="sr-only">Select</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y border-t">
                            {sorted.map((item) => {
                                const health = appHealth(item);
                                const isSelected = item.id === app?.id;
                                const requests = rpm(item.id);
                                const errors = errorRate(item.id);
                                return (
                                    <tr key={item.id} className={cn("cursor-pointer hover:bg-muted/30", isSelected && "bg-muted/40")} onClick={() => setSelected(item.id)}>
                                        <td className="px-5 py-3">
                                            <button type="button" aria-pressed={isSelected} onClick={() => setSelected(item.id)} className="flex items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-ring">
                                                <Box className="size-4 text-muted-foreground" aria-hidden="true" />
                                                <span><span className="block font-semibold text-foreground">{item.name}</span><span className="block text-xs text-muted-foreground">{item.server.name}</span></span>
                                            </button>
                                        </td>
                                        <td className="px-3 py-3"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", health.className)}><span className={cn("size-1.5 rounded-full", health.dot)} aria-hidden="true" />{health.label}</span></td>
                                        <td className="px-3 py-3"><Meter value={item.cpuPercent} /></td>
                                        <td className="px-3 py-3"><Meter value={item.memoryPercent} /></td>
                                        <td className={cn("px-3 py-3 tabular-nums font-semibold", item.restartCount >= 3 ? "text-danger-text" : "text-foreground")}>{item.restartCount}</td>
                                        <td className="px-3 py-3 tabular-nums">{requests === null ? "—" : requests.toLocaleString()}</td>
                                        <td className="px-3 py-3 tabular-nums">{errors === null ? "—" : `${errors.toFixed(1)}%`}</td>
                                        <td className="px-5 py-3 text-right"><Link href={`/apps/${item.id}`} aria-label={`Open ${item.name}`} className="inline-flex text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><ChevronRight className="size-4" aria-hidden="true" /></Link></td>
                            </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {app ? (
                <div className="border-t bg-muted/20 p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Box className="size-4" aria-hidden="true" /></span>
                            <div><p className="font-bold text-foreground">{app.name}</p><p className="text-xs text-muted-foreground">Selected app · {app.server.name}</p></div>
                        </div>
                        <Link href={`/apps/${app.id}?section=metrics`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">Open app metrics<ExternalLink className="size-3.5" aria-hidden="true" /></Link>
                    </div>
                    {locked ? (
                        <p className="mt-4 text-sm text-muted-foreground">Request metrics are not included in your plan.</p>
                    ) : (
                        <>
                            <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                {[
                                    { label: "Requests / min", value: selectedSummary ? Math.round(selectedSummary.totalRequests / 60).toLocaleString() : "—", note: "Last hour" },
                                    { label: "Error rate", value: selectedError === null ? "—" : `${selectedError.toFixed(1)}%`, note: selectedError === null ? "" : selectedError < 1 ? "Within normal range" : "Above normal" },
                                    { label: "Median response", value: p50 === undefined ? "—" : `${Math.round(p50)} ms`, note: "Last hour" },
                                    { label: "Slowest route", value: slowRows[0]?.pathNormalized ?? "—", note: slowRows[0] ? `${formatMs(slowRows[0].p95)} (95th percentile)` : "" },
                                ].map((tile) => (
                                    <div key={tile.label} className="rounded-xl border bg-card p-4">
                                        <dt className="text-xs text-muted-foreground">{tile.label}</dt>
                                        <dd className="mt-1 truncate text-2xl font-bold tabular-nums text-foreground">{tile.value}</dd>
                                        {tile.note ? <p className="text-xs text-muted-foreground">{tile.note}</p> : null}
                                    </div>
                                ))}
                            </dl>
                            <div className="mt-4 grid items-center gap-4 rounded-xl border bg-card p-4 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
                                <p className="text-sm font-semibold text-foreground">Response time</p>
                                <LineSpark data={latency.data?.series.map((point) => point.p50) ?? []} />
                                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Slowest routes</span>{slowRows.length === 0 ? "None yet" : slowRows.map((row) => <span key={row.pathNormalized}><code className="font-mono">{row.pathNormalized}</code> {formatMs(row.p95)}</span>)}</p>
                            </div>
                        </>
                    )}
                </div>
            ) : null}
        </Card>
    );
}

function formatMs(ms: number) {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}


