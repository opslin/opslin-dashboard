"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ActivitySquare } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { chartColors } from "@/lib/design-system";

function statusBadge(status: string) {
    switch (status) {
        case "firing":
            return "bg-chart-3/15 text-chart-3";
        case "resolved":
            return "bg-chart-5/15 text-chart-5";
        case "silenced":
            return "bg-chart-4/15 text-chart-4";
        default:
            return "bg-secondary text-muted-foreground";
    }
}

function buildPolyline(values: number[], width: number, height: number) {
    if (values.length === 0) {
        return "";
    }
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);

    return values.map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
    }).join(" ");
}

// Marker x-position uses the same uniform index-based spacing as buildPolyline
// (samples aren't evenly spaced in time), so it finds the closest sample by
// timestamp and places the marker at that sample's index position.
function markerX(markerTime: string | null, samples: Array<{ time: string }>, width: number): number | null {
    if (!markerTime || samples.length === 0) {
        return null;
    }
    const target = new Date(markerTime).getTime();
    let closestIndex = 0;
    let closestDiff = Infinity;
    samples.forEach((sample, index) => {
        const diff = Math.abs(new Date(sample.time).getTime() - target);
        if (diff < closestDiff) {
            closestDiff = diff;
            closestIndex = index;
        }
    });
    return (closestIndex / Math.max(samples.length - 1, 1)) * width;
}

export default function AlertEventPage() {
    const params = useParams();
    const eventId = params.id as string;
    const { data, isLoading } = useQuery({
        queryKey: ["alert-event", eventId],
        queryFn: () => api.getAlertEvent(eventId),
    });

    const values = data?.chart.samples.map((sample) => sample.value) || [];
    const threshold = data?.chart.threshold || 0;
    const maxValue = values.length > 0 ? Math.max(...values, threshold, 1) : 1;
    const thresholdY = 180 - (threshold / maxValue) * 180;

    return (
        <>
            <Header
                title="Alert drill-in"
                description="Metric window, threshold band, and incident markers."
                actions={
                    <Button asChild variant="outline">
                        <Link href="/alerts">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to alerts
                        </Link>
                    </Button>
                }
            />

            <div className="space-y-6 p-6">
                {isLoading || !data ? (
                    <Card>
                        <CardContent className="py-12 text-center text-sm text-muted-foreground">
                            Loading alert event…
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <CardTitle>{data.rule.metricLabel}</CardTitle>
                                    <Badge className={statusBadge(data.status)}>{data.status.toUpperCase()}</Badge>
                                </div>
                                <CardDescription>
                                    {(data.rule.app?.name || data.rule.server?.name || "Unknown target")} · threshold {data.rule.threshold}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-3">
                                <div className="rounded-xl border border-border/70 p-4">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Opened</p>
                                    <p className="mt-2 font-medium text-foreground">{new Date(data.openedAt).toLocaleString()}</p>
                                </div>
                                <div className="rounded-xl border border-border/70 p-4">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Resolved</p>
                                    <p className="mt-2 font-medium text-foreground">{data.resolvedAt ? new Date(data.resolvedAt).toLocaleString() : "Still open"}</p>
                                </div>
                                <div className="rounded-xl border border-border/70 p-4">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Peak / Last</p>
                                    <p className="mt-2 font-medium text-foreground">{data.peakValue ?? "n/a"} / {data.lastValue ?? "n/a"}</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <ActivitySquare className="h-5 w-5 text-muted-foreground" />
                                    Threshold band
                                </CardTitle>
                                <CardDescription>The red line shows the configured threshold; the markers show when the incident opened and resolved.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto rounded-xl border border-border/70 bg-secondary/40 p-4">
                                    <svg viewBox="0 0 640 220" className="h-56 w-full min-w-[640px]">
                                        <line x1="0" y1={thresholdY} x2="640" y2={thresholdY} stroke={chartColors.danger} strokeDasharray="6 6" strokeWidth="2" />
                                        <polyline
                                            fill="none"
                                            stroke={chartColors.info}
                                            strokeWidth="3"
                                            points={buildPolyline(values, 640, 180)}
                                        />
                                        {(() => {
                                            const openedX = markerX(data.chart.markers.openedAt, data.chart.samples, 640);
                                            return openedX === null ? null : (
                                                <g>
                                                    <line x1={openedX} y1="0" x2={openedX} y2="180" stroke={chartColors.danger} strokeWidth="1.5" strokeDasharray="3 3" />
                                                    <text x={openedX} y="196" textAnchor="middle" fontSize="10" fill={chartColors.danger}>Opened</text>
                                                </g>
                                            );
                                        })()}
                                        {(() => {
                                            const resolvedX = markerX(data.chart.markers.resolvedAt, data.chart.samples, 640);
                                            return resolvedX === null ? null : (
                                                <g>
                                                    <line x1={resolvedX} y1="0" x2={resolvedX} y2="180" stroke={chartColors.success} strokeWidth="1.5" strokeDasharray="3 3" />
                                                    <text x={resolvedX} y="196" textAnchor="middle" fontSize="10" fill={chartColors.success}>Resolved</text>
                                                </g>
                                            );
                                        })()}
                                    </svg>
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    {data.chart.samples.slice(-12).map((sample) => (
                                        <div key={sample.time} className="rounded-xl border border-border/70 p-3 text-sm">
                                            <p className="font-medium text-foreground">{new Date(sample.time).toLocaleTimeString()}</p>
                                            <p className="text-muted-foreground">Value: {sample.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </>
    );
}
