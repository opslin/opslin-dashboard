"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Box, ChevronRight, LineChart, MoreHorizontal, Plus, Rocket, Server as ServerIcon, LayoutGrid, Bell } from "lucide-react";
import { api, type DeploymentRecord } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { OverviewStatCard, OverviewStatCardSkeleton, type Bar } from "@/components/dashboard/overview-stat-card";
import { DeployActivityChart } from "@/components/dashboard/deploy-activity-chart";
import { OverviewActivity } from "@/components/dashboard/overview-activity";
import { SectionHeader } from "@/components/dashboard/section-header";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { StaggerGroup, StaggerItem } from "@/components/patterns/motion";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { cn, formatRelativeTime } from "@/lib/utils";

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

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [
    { value: "7", label: "7 days" },
    { value: "14", label: "14 days" },
    { value: "30", label: "30 days" },
] as const;
const BAR_COUNT = 30;

function startOfDay(date: Date) {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    return day;
}

function percentChange(current: number, previous: number) {
    if (previous === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - previous) / previous) * 100);
}

function greeting(now = new Date()) {
    const hour = now.getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** Bars for the last N days from a list of timestamps. */
function dailyBars(timestamps: string[], days = BAR_COUNT): Bar[] {
    const today = startOfDay(new Date()).getTime();
    const counts = Array.from({ length: days }, () => 0);
    for (const stamp of timestamps) {
        const age = Math.floor((today - startOfDay(new Date(stamp)).getTime()) / DAY_MS);
        if (age >= 0 && age < days) counts[days - 1 - age] += 1;
    }
    const max = Math.max(1, ...counts);
    return counts.map((count) => ({ value: count / max, muted: count === 0 }));
}

/** Running total over the last N days (items created before the window count from day one). */
function cumulativeBars(timestamps: string[], days = BAR_COUNT): Bar[] {
    const today = startOfDay(new Date()).getTime();
    const totals = Array.from({ length: days }, (_, index) => {
        const dayEnd = today - (days - 1 - index) * DAY_MS + DAY_MS;
        return timestamps.filter((stamp) => new Date(stamp).getTime() < dayEnd).length;
    });
    const max = Math.max(1, ...totals);
    return totals.map((total) => ({ value: total / max, muted: total === 0 }));
}

const APP_TILES = [
    "bg-primary/10 text-primary",
    "bg-chart-violet/15 text-chart-violet-text",
    "bg-success-muted text-success-text",
    "bg-warning-muted text-warning-text",
    "bg-info-muted text-info-text",
    "bg-danger-muted text-danger-text",
] as const;

function tileFor(name: string) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return APP_TILES[hash % APP_TILES.length];
}

function serverTone(status: string): StatusTone {
    if (status === "connected") return "success";
    if (status === "pending" || status === "unclaimed") return "warning";
    return "danger";
}

export default function DashboardHomePage() {
    const { user } = useAuth();
    const [range, setRange] = useState<string>("7");
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
    const runningShare = apps.length > 0 ? Math.round((appsRunning / apps.length) * 100) : 0;

    const chartData = useMemo(() => {
        const days = Number(range);
        const today = startOfDay(new Date());
        const buckets = Array.from({ length: days }, (_, index) => {
            const day = new Date(today.getTime() - (days - 1 - index) * DAY_MS);
            return { key: day.toDateString(), label: DAY_LABEL.format(day), succeeded: 0, failed: 0 };
        });
        for (const deployment of deployments) {
            const bucket = buckets.find((b) => b.key === new Date(deployment.startedAt).toDateString());
            if (!bucket) continue;
            if (deployment.status === "succeeded") bucket.succeeded += 1;
            else bucket.failed += 1;
        }
        return buckets;
    }, [deployments, range]);

    const { thisWeek, lastWeek } = useMemo(() => {
        const today = startOfDay(new Date()).getTime();
        let current = 0;
        let previous = 0;
        for (const deployment of deployments) {
            const age = Math.floor((today - startOfDay(new Date(deployment.startedAt)).getTime()) / DAY_MS);
            if (age >= 0 && age < 7) current += 1;
            else if (age >= 7 && age < 14) previous += 1;
        }
        return { thisWeek: current, lastWeek: previous };
    }, [deployments]);

    const weekChange = percentChange(thisWeek, lastWeek);
    const recentDeployments = deployments.slice(0, 5);
    const firstName = user?.name?.trim().split(/\s+/)[0];

    return (
        <>
            <Header
                eyebrow={firstName ? `${greeting()}, ${firstName}` : greeting()}
                title="Overview"
                description="Your fleet at a glance."
                large
                actions={
                    <>
                        <Button variant="outline" size="lg" asChild>
                            <Link href="/servers">
                                <Plus /> Add server
                            </Link>
                        </Button>
                        <Button variant="dark" size="lg" asChild>
                            <Link href="/apps/new">
                                <Rocket /> Deploy app
                            </Link>
                        </Button>
                    </>
                }
            />

            <StaggerGroup className="dashboard-page">
                <StaggerItem className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {serversLoading ? (
                        <OverviewStatCardSkeleton />
                    ) : (
                        <OverviewStatCard
                            href="/servers"
                            label="Servers online"
                            icon={ServerIcon}
                            tone="blue"
                            value={serversOnline}
                            total={servers.length}
                            pill={
                                servers.length === 0
                                    ? { label: "No servers", tone: "neutral", marker: "dot" }
                                    : serversOnline === servers.length
                                      ? { label: "All online", tone: "success", marker: "dot" }
                                      : { label: `${servers.length - serversOnline} offline`, tone: "danger", marker: "dot" }
                            }
                            bars={cumulativeBars(servers.map((server) => server.createdAt))}
                            footerTitle={servers.length === 0 ? "No servers connected yet." : serversOnline === servers.length ? "Every server is reporting." : "Some servers are not reporting."}
                            footerDescription={`${servers.length} server${servers.length === 1 ? "" : "s"} registered`}
                        />
                    )}
                    {appsLoading ? (
                        <OverviewStatCardSkeleton />
                    ) : (
                        <OverviewStatCard
                            href="/apps"
                            label="Apps running"
                            icon={LayoutGrid}
                            tone="violet"
                            value={appsRunning}
                            total={apps.length}
                            pill={
                                apps.length === 0
                                    ? { label: "No apps", tone: "neutral", marker: "dot" }
                                    : { label: `${runningShare}% running`, tone: runningShare >= 50 ? "success" : "warning", marker: "dot" }
                            }
                            bars={cumulativeBars(apps.map((app) => app.createdAt))}
                            footerTitle={`${apps.length - appsRunning} not running.`}
                            footerDescription={`${apps.length} app${apps.length === 1 ? "" : "s"} in total`}
                        />
                    )}
                    {deploymentsLoading ? (
                        <OverviewStatCardSkeleton />
                    ) : (
                        <OverviewStatCard
                            href="/deployments"
                            label="Deploys this week"
                            icon={Rocket}
                            tone="green"
                            value={thisWeek}
                            pill={
                                weekChange > 0
                                    ? { label: `+${weekChange}%`, tone: "success", marker: "up" }
                                    : weekChange < 0
                                      ? { label: `${weekChange}%`, tone: "danger", marker: "down" }
                                      : { label: "No change", tone: "neutral", marker: "dot" }
                            }
                            bars={dailyBars(deployments.map((deployment) => deployment.startedAt))}
                            footerTitle={weekChange >= 0 ? "Release cadence is steady." : "Fewer releases than last week."}
                            footerDescription={`${lastWeek} the week before`}
                        />
                    )}
                    <OverviewStatCard
                        href="/alerts"
                        label="Open alerts"
                        icon={Bell}
                        tone="red"
                        value={firingAlerts.length}
                        pill={firingAlerts.length > 0 ? { label: "Firing", tone: "danger", marker: "dot" } : { label: "All clear", tone: "success", marker: "dot" }}
                        bars={dailyBars(firingAlerts.map((alert) => alert.openedAt))}
                        footerTitle={firingAlerts.length > 0 ? "Needs attention." : "Nothing is firing."}
                        footerDescription={firingAlerts.length > 0 ? `${firingAlerts.length} alert${firingAlerts.length === 1 ? "" : "s"} currently firing` : "No open alerts"}
                    />
                </StaggerItem>

                <StaggerItem className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)]">
                    <Card className="gap-4">
                        <Tabs value={range} onValueChange={setRange} className="gap-4">
                            <SectionHeader
                                icon={LineChart}
                                title="Deploy activity"
                                description="Deployments per day"
                                action={
                                    <TabsList aria-label="Chart range" className="h-10 rounded-lg p-1">
                                        {RANGES.map((option) => (
                                            <TabsTrigger key={option.value} value={option.value} className="rounded-md px-3 text-[13px] data-[state=active]:shadow-sm">
                                                {option.label}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                }
                            />
                            <CardContent>
                                <TabsContent value={range}>
                                    <DeployActivityChart data={chartData} />
                                </TabsContent>
                            </CardContent>
                        </Tabs>
                    </Card>

                    <Card className="gap-4">
                        <SectionHeader icon={ServerIcon} title="Server fleet" href="/servers" />
                        <CardContent>
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
                                <ul className="divide-y">
                                    {servers.slice(0, 6).map((server) => (
                                        <li key={server.id}>
                                            <Link href={`/servers/${server.id}`} className="group flex items-center gap-3 py-1.5 text-[13px] hover:bg-muted/40">
                                                <ServerIcon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                                                <span className="w-[26%] min-w-0 shrink-0 truncate font-semibold text-foreground">{server.name}</span>
                                                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{server.ip}</span>
                                                <StatusBadge status={server.status} tone={serverTone(server.status)} label={server.status === "connected" ? "Connected" : server.status === "pending" ? "Pending" : server.status === "unclaimed" ? "Unclaimed" : "Offline"} />
                                                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </StaggerItem>

                <StaggerItem className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)]">
                    <Card className="gap-4">
                        <SectionHeader icon={Box} title="Recent deployments" href="/deployments" />
                        <CardContent>
                            {deploymentsLoading ? (
                                <TableSkeleton rows={5} cols={4} />
                            ) : recentDeployments.length === 0 ? (
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
                            ) : (
                                <Table className="text-[13px]">
                                    <TableHeader className="bg-transparent">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead>App</TableHead>
                                            <TableHead>Commit</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Started</TableHead>
                                            <TableHead className="w-10">
                                                <span className="sr-only">Actions</span>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recentDeployments.map((deployment) => (
                                            <TableRow key={deployment.id}>
                                                <TableCell className="h-[34px] py-1">
                                                    <Link href={`/apps/${deployment.appId}`} className="flex items-center gap-2.5 font-medium text-primary hover:underline">
                                                        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", tileFor(deployment.appName))}>
                                                            <Box className="size-3.5" aria-hidden="true" />
                                                        </span>
                                                        {deployment.appName}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="h-[34px] py-1 font-mono text-xs text-muted-foreground">{deployment.sha.slice(0, 7)}</TableCell>
                                                <TableCell className="h-[34px] py-1">
                                                    <StatusBadge status={deployment.status} />
                                                </TableCell>
                                                <TableCell className="h-[34px] py-1 text-muted-foreground">{formatRelativeTime(deployment.startedAt)}</TableCell>
                                                <TableCell className="h-[34px] py-1">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${deployment.appName}`}>
                                                                <MoreHorizontal />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem asChild>
                                                                <Link href={`/apps/${deployment.appId}`}>View app</Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild>
                                                                <Link href={`/apps/${deployment.appId}?section=deployments`}>Deployment history</Link>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="gap-4">
                        <SectionHeader icon={Activity} title="Live activity" href="/activity" />
                        <CardContent>
                            {!activity || activity.events.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No recent activity.</p>
                            ) : (
                                <OverviewActivity events={activity.events.slice(0, 8)} />
                            )}
                        </CardContent>
                    </Card>
                </StaggerItem>
            </StaggerGroup>
        </>
    );
}
