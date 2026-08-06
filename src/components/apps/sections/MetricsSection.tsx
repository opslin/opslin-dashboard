"use client";

import { lazy, Suspense, useState, useEffect } from "react";
import { RefreshCw, LineChart } from "lucide-react";
import { AppPageSkeleton } from "@/components/apps/AppPageSkeleton";
import { Button } from "@/components/ui/button";
import type { DeploymentRecord } from "@/lib/api";

export const METRICS_REFETCH_INTERVAL_MS = 60_000;

const LazyAppLiveMonitor = lazy(() =>
    import("@/components/apps/app-live-monitor").then((m) => ({ default: m.AppLiveMonitor }))
);

const LazyAppObservabilityPanel = lazy(() =>
    import("@/components/apps/app-observability-panel").then((m) => ({ default: m.AppObservabilityPanel }))
);

type MetricsSectionProps = {
    appId: string;
    serverId: string;
    deployments: DeploymentRecord[];
    active: boolean;
};

function formatTimestamp(date: Date) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
}

export function MetricsSection({ appId, serverId, deployments, active }: MetricsSectionProps) {
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Update "last updated" tick when section becomes active and on refresh interval
    useEffect(() => {
        if (!active) return;
        setLastUpdated(new Date());
        const id = window.setInterval(() => setLastUpdated(new Date()), METRICS_REFETCH_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [active, refreshKey]);

    if (!active) {
        return <AppPageSkeleton section="metrics" />;
    }

    return (
        <section className="space-y-5">
            {/* Header card — matches reference image */}
            <div className="rounded-xl border border-border bg-card shadow-sm">
                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-muted border border-border shrink-0">
                            <LineChart size={24} />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-foreground">Metrics</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Real-time container telemetry and request analytics. Data refreshes every 60s.
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                If metrics are not available yet, deploy the app and keep the server agent connected.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {lastUpdated && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                                Last updated {formatTimestamp(lastUpdated)}
                            </span>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 border-border"
                            onClick={() => setRefreshKey(k => k + 1)}
                            title="Refresh now"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>

            <Suspense fallback={<AppPageSkeleton section="metrics" />}>
                <LazyAppLiveMonitor
                    key={`live-${refreshKey}`}
                    appId={appId}
                    serverId={serverId}
                    deployments={deployments}
                    enabled={active}
                    refreshIntervalMs={METRICS_REFETCH_INTERVAL_MS}
                />
                <LazyAppObservabilityPanel
                    key={`obs-${refreshKey}`}
                    appId={appId}
                    enabled={active}
                    refreshIntervalMs={METRICS_REFETCH_INTERVAL_MS}
                />
            </Suspense>
        </section>
    );
}
