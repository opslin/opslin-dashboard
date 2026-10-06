"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Box, MoreHorizontal, Rocket, Server as ServerIcon } from "lucide-react";
import { api, type DeploymentRecord } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/stat-card";
import { DeployActivityChart } from "@/components/dashboard/deploy-activity-chart";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { StaggerGroup, StaggerItem } from "@/components/patterns/motion";
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

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [
    { value: "7", label: "7 days" },
    { value: "14", label: "14 days" },
    { value: "30", label: "30 days" },
] as const;

function startOfDay(date: Date) {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    return day;
}

function percentChange(current: number, previous: number) {
    if (previous === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - previous) / previous) * 100);
}

export default function DashboardHomePage() {
    const [range, setRange] = useState<string>("14");
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
    const recentDeployments = deployments.slice(0, 8);
    const appsRunningShare = apps.length > 0 ? Math.round((appsRunning / apps.length) * 100) : 0;

    return (
        <>
            <Header
                title="Overview"
                description="Your fleet at a glance."
                actions={
                    <>
                        <Button variant="outline" asChild>
                            <Link href="/servers">
                                <ServerIcon /> Add server
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/apps/new">
                                <Rocket /> Deploy app
                            </Link>
                        </Button>
                    </>
                }
            />

            <StaggerGroup className="dashboard-page">
                <StaggerItem className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {serversLoading ? (
                        <StatCardSkeleton />
                    ) : (
                        <StatCard
                            label="Servers online"
                            icon={ServerIcon}
                            value={serversOnline}
                            badge={{ label: `${serversOnline} / ${servers.length}`, trend: serversOnline === servers.length && servers.length > 0 ? "up" : "neutral" }}
                            footerTitle={servers.length === 0 ? "No servers connected" : serversOnline === servers.length ? "Every server is reporting" : "Some servers are offline"}
                            footerDescription={`${servers.length} server${servers.length === 1 ? "" : "s"} registered`}
                        />
                    )}
                    {appsLoading ? (
                        <StatCardSkeleton />
                    ) : (
                        <StatCard
                            label="Apps running"
                            icon={Box}
                            value={appsRunning}
                            badge={{ label: `${appsRunningShare}%`, trend: appsRunningShare >= 50 ? "up" : "down" }}
                            footerTitle={apps.length === 0 ? "No apps deployed yet" : `${apps.length - appsRunning} not running`}
                            footerDescription={`${apps.length} app${apps.length === 1 ? "" : "s"} in total`}
                        />
                    )}
                    {deploymentsLoading ? (
                        <StatCardSkeleton />
                    ) : (
                        <StatCard
                            label="Deploys this week"
                            icon={Rocket}
                            value={thisWeek}
                            badge={{ label: `${weekChange > 0 ? "+" : ""}${weekChange}%`, trend: weekChange > 0 ? "up" : weekChange < 0 ? "down" : "neutral" }}
                            footerTitle={weekChange >= 0 ? "Release cadence is steady" : "Fewer releases than last week"}
                            footerDescription={`${lastWeek} the week before`}
                        />
                    )}
                    <StatCard
                        label="Open alerts"
                        icon={BellRing}
                        value={firingAlerts.length}
                        badge={{ label: firingAlerts.length > 0 ? "Firing" : "All clear", trend: firingAlerts.length > 0 ? "down" : "up" }}
                        footerTitle={firingAlerts.length > 0 ? "Needs attention" : "Nothing is firing"}
                        footerDescription="Across all monitored servers and apps"
                    />
                </StaggerItem>

                <StaggerItem className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <Card className="xl:col-span-2">
                        <Tabs value={range} onValueChange={setRange} className="gap-6">
                            <CardHeader>
                                <CardTitle>Deploy activity</CardTitle>
                                <CardDescription>Deployments per day over the last {range} days.</CardDescription>
                                <CardAction>
                                    <TabsList aria-label="Chart range">
                                        {RANGES.map((option) => (
                                            <TabsTrigger key={option.value} value={option.value}>
                                                {option.label}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                </CardAction>
                            </CardHeader>
                            <CardContent>
                                <TabsContent value={range}>
                                    <DeployActivityChart data={chartData} />
                                </TabsContent>
                            </CardContent>
                        </Tabs>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Server fleet</CardTitle>
                            <CardDescription>
                                {servers.length} server{servers.length === 1 ? "" : "s"} connected to Opslin.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-1">
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
                                        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
                                    >
                                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                            <ServerIcon className="size-4" aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-foreground">{server.name}</span>
                                            <span className="block truncate font-mono text-xs text-muted-foreground">{server.ip}</span>
                                        </span>
                                        <StatusBadge status={server.status} />
                                    </Link>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </StaggerItem>

                <StaggerItem className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <Card className="xl:col-span-2">
                        <CardHeader>
                            <CardTitle>Recent deployments</CardTitle>
                            <CardDescription>Latest releases across every app.</CardDescription>
                            <CardAction>
                                <Button variant="outline" size="sm" asChild>
                                    <Link href="/deployments">View all</Link>
                                </Button>
                            </CardAction>
                        </CardHeader>
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
                                <div className="overflow-hidden rounded-lg border">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
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
                                                    <TableCell className="font-medium">
                                                        <Link href={`/apps/${deployment.appId}`} className="hover:underline">
                                                            {deployment.appName}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                                        {deployment.sha.slice(0, 7)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusBadge status={deployment.status} />
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {formatRelativeTime(deployment.startedAt)}
                                                    </TableCell>
                                                    <TableCell>
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
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Live activity</CardTitle>
                            <CardDescription>What&apos;s happening across your organization.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!activity || activity.events.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No recent activity.</p>
                            ) : (
                                <ol className="relative space-y-5 border-s ps-5">
                                    {activity.events.slice(0, 8).map((event) => (
                                        <li key={event.id} className="relative">
                                            <span className="absolute -start-[25px] top-1.5 size-2 rounded-full bg-primary ring-4 ring-card" />
                                            <p className="text-sm text-foreground">{event.description}</p>
                                            <p className="text-xs text-muted-foreground">{formatRelativeTime(event.createdAt)}</p>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </CardContent>
                    </Card>
                </StaggerItem>
            </StaggerGroup>
        </>
    );
}
