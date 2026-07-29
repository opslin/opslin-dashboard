"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Box, Rocket, Server as ServerIcon } from "lucide-react";
import { api, type DeploymentRecord } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/patterns/stat-tile";
import { StatTileSkeleton } from "@/components/patterns/stat-tile-skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { StaggerGroup, StaggerItem } from "@/components/patterns/motion";
import { BarMetricChart } from "@/components/patterns/metric-chart";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { formatRelativeTime } from "@/lib/utils";

type DeploymentItem = DeploymentRecord & { appId: string; appName: string };

function useRecentDeployments() {
    const { data: apps = [], isLoading: appsLoading } = useQuery({
        queryKey: ["home", "apps"],
        queryFn: () => api.getAllApps(),
    });

    const { data: deployments = [], isLoading: deploymentsLoading } = useQuery({
        queryKey: ["home", "deployments", apps.map((app) => app.id)],
        enabled: apps.length > 0,
        queryFn: async () => {
            const records = await Promise.all(
                apps.map(async (app) => {
                    try {
                        const items = await api.getAppDeployments(app.id);
                        return items.map((deployment): DeploymentItem => ({
                            ...deployment,
                            appId: app.id,
                            appName: app.name,
                        }));
                    } catch {
                        return [] as DeploymentItem[];
                    }
                })
            );
            return records.flat().sort(
                (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
            );
        },
    });

    return { apps, appsLoading, deployments, isLoading: appsLoading || (apps.length > 0 && deploymentsLoading) };
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short" });

export default function DashboardHomePage() {
    const { data: servers = [], isLoading: serversLoading } = useQuery({
        queryKey: ["home", "servers"],
        queryFn: () => api.getServers(),
    });
    const { data: firingAlerts = [] } = useQuery({
        queryKey: ["home", "alerts", "firing"],
        queryFn: () => api.getAlertEvents("firing"),
    });
    const { data: activity } = useQuery({
        queryKey: ["home", "activity"],
        queryFn: () => api.getActivity({ limit: 8 }),
    });

    const { apps, appsLoading, deployments, isLoading: deploymentsLoading } = useRecentDeployments();

    const serversOnline = servers.filter((server) => server.status === "connected").length;
    const appsRunning = apps.filter((app) => app.status === "running").length;

    const dailyDeployBuckets = useMemo(() => {
        const days = Array.from({ length: 7 }, (_, index) => {
            const day = new Date();
            day.setHours(0, 0, 0, 0);
            day.setDate(day.getDate() - (6 - index));
            return { key: day.toDateString(), label: WEEKDAY_FORMAT.format(day), value: 0 };
        });
        for (const deployment of deployments) {
            const key = new Date(deployment.startedAt).toDateString();
            const bucket = days.find((day) => day.key === key);
            if (bucket) {
                bucket.value += 1;
            }
        }
        return days;
    }, [deployments]);

    const deploysThisWeek = dailyDeployBuckets.reduce((sum, day) => sum + day.value, 0);
    const recentDeployments = deployments.slice(0, 6);

    return (
        <>
            <Header title="Overview" description="Your fleet at a glance." />

            <StaggerGroup className="dashboard-page">
                <StaggerItem className="glow-ambient grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {serversLoading ? (
                        <StatTileSkeleton variant="inverse" />
                    ) : (
                        <StatTile
                            variant="inverse"
                            label="Servers online"
                            value={serversOnline}
                            icon={ServerIcon}
                            live={serversOnline > 0}
                            delta={{ label: `of ${servers.length} total`, direction: "neutral" }}
                        />
                    )}
                    {appsLoading ? (
                        <StatTileSkeleton />
                    ) : (
                        <StatTile
                            label="Apps running"
                            value={appsRunning}
                            icon={Box}
                            accent="violet"
                            delta={{ label: `of ${apps.length} total`, direction: "neutral" }}
                        />
                    )}
                    {deploymentsLoading ? (
                        <StatTileSkeleton />
                    ) : (
                        <StatTile
                            label="Deploys this week"
                            value={deploysThisWeek}
                            icon={Rocket}
                            accent="blue"
                            sparkline={dailyDeployBuckets.map((day) => day.value)}
                        />
                    )}
                    <StatTile
                        label="Open alerts"
                        value={firingAlerts.length}
                        icon={BellRing}
                        accent={firingAlerts.length > 0 ? "warning" : "brand"}
                        delta={
                            firingAlerts.length > 0
                                ? { label: "needs attention", direction: "down" }
                                : { label: "all clear", direction: "up" }
                        }
                    />
                </StaggerItem>

                <StaggerItem className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-border/80 bg-card p-5 lg:col-span-2">
                        <h2 className="text-sm font-semibold text-foreground">Deploy activity</h2>
                        <p className="text-xs text-muted-foreground">Deployments per day, last 7 days.</p>
                        <BarMetricChart data={dailyDeployBuckets} height={220} className="mt-4" />
                    </div>

                    <div className="rounded-lg border border-border/80 bg-card p-5">
                        <h2 className="text-sm font-semibold text-foreground">Server fleet</h2>
                        <p className="text-xs text-muted-foreground">
                            {servers.length} server{servers.length === 1 ? "" : "s"} connected to Opslin.
                        </p>
                        <div className="mt-4 space-y-1">
                            {servers.length === 0 ? (
                                <EmptyState
                                    icon={ServerIcon}
                                    title="No servers yet"
                                    description="Connect your first server to see it here."
                                    action={
                                        <Button size="sm" asChild>
                                            <Link href="/servers">Connect a server</Link>
                                        </Button>
                                    }
                                />
                            ) : (
                                servers.slice(0, 6).map((server) => (
                                    <Link
                                        key={server.id}
                                        href={`/servers/${server.id}`}
                                        className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-secondary/50"
                                    >
                                        <span className="truncate font-medium text-foreground">{server.name}</span>
                                        <StatusBadge status={server.status} />
                                    </Link>
                                ))
                            )}
                        </div>
                    </div>
                </StaggerItem>

                <StaggerItem className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-border/80 bg-card lg:col-span-2">
                        <div className="flex items-center justify-between px-5 py-4">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Recent deployments</h2>
                                <p className="text-xs text-muted-foreground">Latest releases across every app.</p>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                                <Link href="/deployments">View all</Link>
                            </Button>
                        </div>
                        {deploymentsLoading ? (
                            <div className="px-5 pb-5">
                                <TableSkeleton rows={5} cols={3} />
                            </div>
                        ) : recentDeployments.length === 0 ? (
                            <div className="px-5 pb-5">
                                <EmptyState
                                    icon={Rocket}
                                    title="No deployments yet"
                                    description="Deploy your first app to see its release history here."
                                    action={
                                        <Button size="sm" asChild>
                                            <Link href="/apps/new">Deploy an app</Link>
                                        </Button>
                                    }
                                />
                            </div>
                        ) : (
                            <div className="divide-y divide-border/70">
                                {recentDeployments.map((deployment) => (
                                    <Link
                                        key={deployment.id}
                                        href={`/apps/${deployment.appId}`}
                                        className="hover-lift relative z-0 flex items-center justify-between gap-3 rounded-md px-5 py-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-sm font-medium text-foreground">
                                                    {deployment.appName}
                                                </span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {deployment.sha.slice(0, 7)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {formatRelativeTime(deployment.startedAt)}
                                            </p>
                                        </div>
                                        <StatusBadge status={deployment.status} />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg border border-border/80 bg-card p-5">
                        <h2 className="text-sm font-semibold text-foreground">Live activity</h2>
                        <p className="text-xs text-muted-foreground">What&apos;s happening across your organization.</p>
                        <div className="mt-4 space-y-4">
                            {!activity || activity.events.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No recent activity.</p>
                            ) : (
                                activity.events.slice(0, 8).map((event) => (
                                    <div key={event.id} className="flex gap-3">
                                        <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                                        <div className="min-w-0">
                                            <p className="text-sm text-foreground">{event.description}</p>
                                            <p className="text-xs text-muted-foreground">{formatRelativeTime(event.createdAt)}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </StaggerItem>
            </StaggerGroup>
        </>
    );
}
