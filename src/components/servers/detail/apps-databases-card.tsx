"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Database as DatabaseIcon, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, type App, type Database } from "@/lib/api";
import { formatMb } from "./format";

function Stat({ label, value, percent }: { label: string; value: string; percent?: number | null }) {
    return (
        <div className="hidden w-24 sm:block">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold text-foreground">{value}</p>
            {percent != null ? (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted" role="presentation">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(3, percent))}%` }} />
                </div>
            ) : null}
        </div>
    );
}

function AppRow({ app }: { app: App }) {
    const { data } = useQuery({
        queryKey: ["app-metrics-current", app.id],
        queryFn: () => api.getAppMetricsCurrent(app.id),
        enabled: app.status === "running",
        refetchInterval: 30_000,
        retry: false,
    });
    const status = app.effectiveStatus ?? app.status;
    return (
        <li>
            <Link href={`/apps/${app.id}`} className="flex items-center gap-4 rounded-xl border bg-card p-3.5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold uppercase text-background" aria-hidden="true">{app.name.slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-foreground">{app.name}</span>
                        <StatusBadge status={status} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{app.domain || "No domain yet"}</p>
                </div>
                <Stat label="CPU" value={data?.cpuPercent != null ? `${Math.round(data.cpuPercent)}%` : "—"} percent={data?.cpuPercent} />
                <Stat label="Memory" value={formatMb(data?.memoryUsed)} percent={data?.memoryPercent} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
        </li>
    );
}

function DatabaseRow({ database }: { database: Database }) {
    return (
        <li>
            <Link href={`/databases/${database.id}`} className="flex items-center gap-4 rounded-xl border bg-card p-3.5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                    <DatabaseIcon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-foreground">{database.name}</span>
                        <StatusBadge status={database.status} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{database.type.replace("_", " ")}{database.port ? ` · port ${database.port}` : ""}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
        </li>
    );
}

export function AppsDatabasesCard({ serverId, apps, databases, limit, onViewAll }: { serverId: string; apps: App[]; databases: Database[]; limit?: number; onViewAll?: () => void }) {
    const shownApps = limit ? apps.slice(0, limit) : apps;
    const shownDbs = limit ? databases.slice(0, Math.max(0, limit - shownApps.length)) : databases;
    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-center justify-between px-5 pt-5">
                <h2 className="text-lg font-semibold text-foreground">Apps &amp; Databases</h2>
                {onViewAll ? (
                    <button type="button" onClick={onViewAll} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                        View all <ChevronRight className="size-4" aria-hidden="true" />
                    </button>
                ) : null}
            </div>
            <ul className="space-y-3 p-5">
                {shownApps.map((app) => (
                    <AppRow key={app.id} app={app} />
                ))}
                {shownDbs.map((database) => (
                    <DatabaseRow key={database.id} database={database} />
                ))}
                <li>
                    <Link href={`/apps/new?server=${serverId}`} className="flex items-center gap-4 rounded-xl border border-dashed p-3.5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Plus className="size-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-primary">Deploy a new app</span>
                            <span className="block text-sm text-muted-foreground">Connect a GitHub repo or upload your code</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                </li>
            </ul>
        </Card>
    );
}
