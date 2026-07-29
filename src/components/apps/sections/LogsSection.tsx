"use client";

import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Terminal } from "lucide-react";
import { AppPageSkeleton } from "@/components/apps/AppPageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type Server } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

export const LOGS_REFETCH_INTERVAL_MS = 30_000;
const LOG_TAIL_LINE_LIMIT = 200;

const LazyEnhancedLogViewer = lazy(() =>
    import("@/components/logs/enhanced-log-viewer").then((module) => ({
        default: module.EnhancedLogViewer,
    }))
);

type LogsSectionProps = {
    appId: string;
    appName: string;
    server: Pick<Server, "id" | "status" | "isLiveConnected" | "lastSeenAt">;
    active: boolean;
};

function tailLogLines(logs: string) {
    const lines = logs.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length <= LOG_TAIL_LINE_LIMIT) {
        return lines.join("\n");
    }
    return lines.slice(-LOG_TAIL_LINE_LIMIT).join("\n");
}

function agentIsOffline(server: LogsSectionProps["server"]) {
    return server.status === "disconnected" || server.status === "error" || server.isLiveConnected === false;
}

export function LogsSection({
    appId,
    appName,
    server,
    active,
}: LogsSectionProps) {
    const logsQuery = useQuery({
        queryKey: ["appLogs", appId],
        queryFn: () => api.getAppLogs(server.id, appId),
        enabled: active,
        refetchInterval: active ? LOGS_REFETCH_INTERVAL_MS : false,
    });

    if (!active) {
        return <AppPageSkeleton section="logs" />;
    }

    const logs = tailLogLines(logsQuery.data?.logs ?? "");
    const offline = agentIsOffline(server);

    return (
        <Card id="deployment-logs">
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Terminal className="h-5 w-5" />
                        Runtime & Deployment Logs
                    </CardTitle>
                    <CardDescription>
                        {logsQuery.data?.deployedAt
                            ? `Last deployed ${formatRelativeTime(logsQuery.data.deployedAt)}`
                            : "Logs load only while this section is open."}
                    </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Tail {LOG_TAIL_LINE_LIMIT} lines</Badge>
                    <Badge variant="outline">30s refresh</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {offline ? (
                    <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning-text">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-medium">Agent appears offline</p>
                            <p className="mt-1 text-warning/80">
                                Logs may be stale until the server agent reconnects.
                                {server.lastSeenAt ? ` Last seen ${formatRelativeTime(server.lastSeenAt)}.` : ""}
                            </p>
                        </div>
                    </div>
                ) : null}

                <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    Log output is retained by the backend and displayed here as a capped tail to keep the dashboard responsive.
                </p>

                {logsQuery.isLoading ? (
                    <AppPageSkeleton section="logs" />
                ) : logsQuery.isError ? (
                    <div className="rounded-lg border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-danger-text">
                        Unable to load app logs. Check the server agent connection and try again.
                    </div>
                ) : logs ? (
                    <Suspense fallback={<AppPageSkeleton section="logs" />}>
                        <LazyEnhancedLogViewer
                            lines={logs}
                            title="Deployment log stream"
                            description="Search, filter, and download the last captured deploy output."
                            fileName={`opslin-${appName}-deploy.log`}
                        />
                    </Suspense>
                ) : (
                    <div className="rounded-lg border border-dashed px-5 py-10 text-sm text-muted-foreground">
                        No deployment logs available yet. Deploy the app to see logs.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
