"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, Server as ServerIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiRequestError, type AppOverviewMetric, type Server } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AppsTable, Bar } from "./overview";
import { timeAgo, type ServerMetrics } from "./lib";

export type ServerRow = { server: Server; live: boolean; current: ServerMetrics | null };

function Meter({ value }: { value: number }) {
    const tone = value >= 90 ? "danger" : value >= 70 ? "warning" : "success";
    return (
        <span className="flex items-center gap-2">
            <span className="w-20"><Bar value={value} tone={tone} /></span>
            <span className="w-10 tabular-nums text-muted-foreground">{Math.round(value)}%</span>
        </span>
    );
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
        .sort((a, b) => worst(b) - worst(a));
    const online = rows.filter((row) => row.live).length;
    const attention = rows.filter((row) => !row.live || worst(row) >= 70).length;

    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
                <div>
                    <h2 className="text-lg font-bold text-foreground">Servers</h2>
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
                        <tr className="border-t text-left text-xs font-medium text-muted-foreground">
                            <th className="px-5 py-2.5 font-medium">Server</th>
                            <th className="px-3 py-2.5 font-medium">CPU</th>
                            <th className="px-3 py-2.5 font-medium">Memory</th>
                            <th className="px-3 py-2.5 font-medium">Disk</th>
                            <th className="px-3 py-2.5 font-medium">Load</th>
                            <th className="px-3 py-2.5 font-medium">Agent</th>
                            <th className="px-5 py-2.5 text-right font-medium">Last seen</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {visible.map(({ server, live, current }) => (
                            <tr key={server.id} className={cn("hover:bg-muted/30", !live && "text-muted-foreground")}>
                                <td className="px-5 py-3">
                                    <Link href={`/servers/${server.id}`} className="flex items-center gap-3 focus-visible:ring-2 focus-visible:ring-ring">
                                        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ServerIcon className="size-4" aria-hidden="true" /></span>
                                        <span>
                                            <span className="flex items-center gap-2 font-semibold text-foreground"><span className={cn("size-2 rounded-full", live ? "bg-success" : "bg-muted-foreground")} aria-hidden="true" />{server.name || server.hostname || server.ip}</span>
                                            <span className="block text-xs text-muted-foreground">{live ? server.publicIp || server.ip : "Offline"}</span>
                                        </span>
                                    </Link>
                                </td>
                                <td className="px-3 py-3">{current ? <Meter value={current.cpu.percent} /> : "—"}</td>
                                <td className="px-3 py-3">{current ? <Meter value={current.memory.percent} /> : "—"}</td>
                                <td className="px-3 py-3">{current ? <Meter value={current.disk.percent} /> : "—"}</td>
                                <td className="px-3 py-3 tabular-nums">{current ? (current.cpu.loadAvg[0] ?? 0).toFixed(2) : "—"}</td>
                                <td className="px-3 py-3 tabular-nums">{server.agentVersion ? `v${server.agentVersion}` : "—"}{server.agentVersionWarning ? <span className="ml-2 rounded-full bg-warning-muted px-2 py-0.5 text-[11px] font-medium text-warning-text">Update available</span> : null}</td>
                                <td className="px-5 py-3 text-right">{live ? "Now" : server.lastSeenAt ? timeAgo(server.lastSeenAt) : "—"}</td>
                            </tr>
                        ))}
                        {visible.length === 0 ? (
                            <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">No servers match.</td></tr>
                        ) : null}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

function RequestPanel({ app }: { app: AppOverviewMetric }) {
    const summary = useQuery({
        queryKey: ["monitoring-request-summary", app.id],
        queryFn: () => api.getRequestSummary(app.id, "24h"),
        retry: (count, error) => !(error instanceof ApiRequestError && error.status === 403) && count < 2,
        refetchInterval: 60_000,
    });
    const locked = summary.error instanceof ApiRequestError && summary.error.status === 403;
    const data = summary.data;
    const perMinute = data ? Math.round(data.totalRequests / (24 * 60)) : null;
    const tiles = [
        { label: "Requests / min", value: perMinute === null ? "—" : String(perMinute) },
        { label: "Error rate", value: data ? `${(data.errorRate * (data.errorRate <= 1 ? 100 : 1)).toFixed(1)}%` : "—" },
        { label: "Average response", value: data ? `${Math.round(data.avgResponseMs)} ms` : "—" },
        { label: "Requests (24h)", value: data ? data.totalRequests.toLocaleString() : "—" },
    ];
    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
                <div>
                    <h2 className="text-lg font-bold text-foreground">{app.name} requests</h2>
                    <p className="text-sm text-muted-foreground">Traffic to this app in the last 24 hours</p>
                </div>
                <Link href={`/apps/${app.id}?section=metrics`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">Open app metrics<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
            </div>
            {locked ? (
                <p className="px-5 pb-6 text-sm text-muted-foreground">Request metrics are not included in your plan.</p>
            ) : (
                <dl className="grid gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
                    {tiles.map((tile) => (
                        <div key={tile.label} className="rounded-xl border p-4">
                            <dt className="text-xs text-muted-foreground">{tile.label}</dt>
                            <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{tile.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </Card>
    );
}

export function AppsTab({ apps }: { apps: AppOverviewMetric[] }) {
    const [selected, setSelected] = useState("");
    const app = apps.find((item) => item.id === selected) ?? apps[0];
    return (
        <div className="space-y-5">
            <Card className="gap-0 rounded-2xl py-0 shadow-xs">
                <div className="px-5 pb-2 pt-5">
                    <h2 className="text-lg font-bold text-foreground">Apps</h2>
                    <p className="text-sm text-muted-foreground">Sorted by how much of the server each app uses.</p>
                </div>
                <AppsTable apps={apps} />
            </Card>
            {apps.length > 0 && app ? (
                <>
                    <div className="flex items-center gap-2 text-sm">
                        <label htmlFor="monitoring-app" className="text-muted-foreground">Show requests for</label>
                        <select id="monitoring-app" value={app.id} onChange={(event) => setSelected(event.target.value)} className="h-9 rounded-lg border bg-card px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring">
                            {apps.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                        </select>
                    </div>
                    <RequestPanel app={app} />
                </>
            ) : null}
        </div>
    );
}
