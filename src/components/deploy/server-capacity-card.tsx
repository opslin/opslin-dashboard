"use client";

/**
 * ServerCapacityCard — Renders the server's hardware profile and the
 * computed capacity advisory (Server-Capacity Safety Guard).
 *
 * Behaviour:
 *   - Fetches the capacity advisory via `GET /servers/:id/capacity-advisory`
 *     using TanStack Query, refreshing every 30 seconds so the card stays
 *     in step with new heartbeats.
 *   - Renders a skeleton while the first request is in flight.
 *   - Renders an "agent connecting" message on a 404 (no metrics yet).
 *   - Otherwise renders the server profile and the verdict:
 *       * orange/yellow warning when `safeVuCeiling === 0`
 *       * green recommendation row when the server is safe for VU testing
 *
 * Validates Requirements 1.5, 1.6.
 */

import { AlertTriangle, Cpu, MemoryStick } from "lucide-react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiRequestError, api, type CapacityAdvisory } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ServerCapacityCardProps {
    serverId: string;
    className?: string;
}

const MIB_PER_GB = 1024;

function formatGb(memMb: number): string {
    if (!Number.isFinite(memMb) || memMb <= 0) {
        return "0.00";
    }
    return (memMb / MIB_PER_GB).toFixed(2);
}

function formatLoad(loadAvg1m: number): string {
    if (!Number.isFinite(loadAvg1m)) {
        return "0.00";
    }
    return loadAvg1m.toFixed(2);
}

/**
 * Skeleton placeholder used while the first advisory fetch is pending.
 * Mirrors the shape of the loaded card so layout shift is minimal.
 */
function CapacityCardSkeleton({ className }: { className?: string }) {
    return (
        <Card
            className={cn("animate-pulse", className)}
            aria-busy="true"
            aria-label="Loading server capacity"
        >
            <CardHeader>
                <div className="h-5 w-40 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="h-4 w-44 rounded bg-muted" />
                <div className="h-4 w-36 rounded bg-muted" />
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="mt-4 h-12 w-full rounded bg-muted" />
            </CardContent>
        </Card>
    );
}

export function ServerCapacityCard({
    serverId,
    className,
}: ServerCapacityCardProps): ReactElement {
    const {
        data: advisory,
        isLoading,
        error,
    } = useQuery<CapacityAdvisory>({
        queryKey: ["capacity-advisory", serverId],
        queryFn: () => api.getCapacityAdvisory(serverId),
        refetchInterval: 30_000,
        enabled: Boolean(serverId),
    });

    if (isLoading) {
        return <CapacityCardSkeleton className={className} />;
    }

    // Surface the "no metrics yet" (404) path with a friendly message. The
    // API returns 404 when the server is connected but no usable
    // ServerMetric row has arrived yet, or the latest sample is older than
    // 60 seconds.
    if (error) {
        const isNoMetrics =
            error instanceof ApiRequestError && error.status === 404;
        return (
            <Card className={className}>
                <CardHeader>
                    <h2 className="text-base font-semibold leading-none">
                        Server capacity
                    </h2>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        {isNoMetrics
                            ? "Server is connecting... capacity will appear once metrics arrive."
                            : "Could not load capacity advisory. Try again shortly."}
                    </p>
                </CardContent>
            </Card>
        );
    }

    if (!advisory) {
        return <CapacityCardSkeleton className={className} />;
    }

    const { serverProfile, safeVuCeiling, recommendedVu, planMaxVu, reason } =
        advisory;

    return (
        <Card className={className}>
            <CardHeader>
                <h2 className="text-base font-semibold leading-none">
                    Server capacity
                </h2>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Server profile — semantic dl for accessibility. */}
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <dt className="sr-only">CPU cores</dt>
                        <dd className="font-medium">
                            {serverProfile.cpuCores} CPU cores
                        </dd>
                    </div>
                    <div className="flex items-center gap-2">
                        <MemoryStick
                            className="h-4 w-4 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <dt className="sr-only">Total memory</dt>
                        <dd className="font-medium">
                            {formatGb(serverProfile.totalMemMb)} GB RAM
                        </dd>
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                        <dt className="text-muted-foreground">Available</dt>
                        <dd className="font-medium">
                            {formatGb(serverProfile.availableMemMb)} GB available
                        </dd>
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                        <dt className="text-muted-foreground">Load</dt>
                        <dd className="font-medium">
                            {formatLoad(serverProfile.loadAvg1m)}
                        </dd>
                    </div>
                </dl>

                {/* Capacity verdict */}
                {safeVuCeiling === 0 ? (
                    <div
                        role="alert"
                        className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning-muted p-3 text-sm text-warning-text"
                    >
                        <AlertTriangle
                            className="mt-0.5 h-5 w-5 shrink-0 text-warning-text"
                            aria-hidden="true"
                        />
                        <div className="space-y-1">
                            <p className="font-semibold">VU testing not available</p>
                            <p className="text-foreground/80">
                                {reason}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1 text-sm">
                        <p className="text-foreground">
                            Safe for{" "}
                            <span className="font-semibold">{safeVuCeiling}</span>{" "}
                            VUs
                        </p>
                        <p className="text-success-text">
                            Recommended:{" "}
                            <span className="font-semibold">{recommendedVu}</span>{" "}
                            VUs
                        </p>
                        <p className="text-muted-foreground">
                            Plan max:{" "}
                            <span className="font-medium">{planMaxVu}</span> VUs
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
