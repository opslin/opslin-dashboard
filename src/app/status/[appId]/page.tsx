"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock, Radio } from "lucide-react";
import { api, type PublicStatusResponse } from "@/lib/api";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Buckets the real (already 90-day-scoped by the API) healthHistory samples
// into one entry per calendar day for the uptime bar strip. `healthy: null`
// means no sample landed on that day (not a claim either way).
function bucketHealthHistoryByDay(history: PublicStatusResponse["healthHistory"], days = 90) {
  const byDate = new Map<string, PublicStatusResponse["healthHistory"]>();
  for (const sample of history) {
    const key = sample.timestamp.slice(0, 10);
    const bucket = byDate.get(key) ?? [];
    bucket.push(sample);
    byDate.set(key, bucket);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: Array<{ date: string; healthy: boolean | null }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    const samples = byDate.get(key);
    buckets.push({
      date: key,
      healthy: samples && samples.length > 0
        ? samples.every((sample) => sample.healthStatus?.toUpperCase() !== "UNHEALTHY")
        : null,
    });
  }
  return buckets;
}

export default function PublicStatusPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const status = useQuery({
    queryKey: ["public-status", appId],
    queryFn: () => api.getPublicStatus(appId),
    enabled: Boolean(appId),
    refetchInterval: 60_000,
  });

  if (status.isLoading) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-10 w-72 animate-pulse rounded bg-muted" />
          <div className="h-56 animate-pulse rounded-lg bg-muted" />
        </div>
      </main>
    );
  }

  if (status.isError || !status.data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Status page unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This app is private, missing, or the public status endpoint is unavailable.
          </CardContent>
        </Card>
      </main>
    );
  }

  const data = status.data;
  const dayBuckets = bucketHealthHistoryByDay(data.healthHistory);

  return (
    <main className="min-h-screen bg-background px-6 py-10" data-testid="public-status-page">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Opslin public status</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{data.app.name}</h1>
              <p className="mt-2 text-sm text-muted-foreground">Last checked {data.app.healthCheckedAt ? new Date(data.app.healthCheckedAt).toLocaleString() : "not yet"}</p>
            </div>
            <StatusBadge status={data.currentStatus} className="h-8 w-fit px-3 text-sm" />
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>90 days ago</span>
              <span>Today</span>
            </div>
            <div className="mt-1.5 flex h-8 gap-[3px]" role="img" aria-label={`Uptime over the last 90 days: ${data.uptimePercent.toFixed(2)}%`}>
              {dayBuckets.map((bucket) => (
                <span
                  key={bucket.date}
                  title={`${bucket.date}: ${bucket.healthy === null ? "no data" : bucket.healthy ? "healthy" : "unhealthy"}`}
                  className={cn(
                    "flex-1 rounded-sm",
                    bucket.healthy === null ? "bg-muted" : bucket.healthy ? "bg-success" : "bg-danger"
                  )}
                />
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <CheckCircle2 className="size-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">90d uptime</p>
                  <p className="text-xl font-semibold">{data.uptimePercent.toFixed(2)}%</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Radio className="size-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Health</p>
                  <p className="text-xl font-semibold">{data.app.healthStatus}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Clock className="size-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Last deploy</p>
                  <p className="text-xl font-semibold">{data.app.deployedAt ? new Date(data.app.deployedAt).toLocaleDateString() : "None"}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4" />
                Health history
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.healthHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No health samples yet.</p>
              ) : (
                data.healthHistory.slice(-12).map((sample) => (
                  <div key={sample.timestamp} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span>{new Date(sample.timestamp).toLocaleString()}</span>
                    <StatusBadge status={sample.healthStatus} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4" />
                Incidents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.incidents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent incidents.</p>
              ) : (
                data.incidents.map((incident) => (
                  <div key={incident.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{incident.metric}</p>
                      <StatusBadge status={incident.severity} />
                    </div>
                    <p className="mt-1 text-muted-foreground">{incident.status} since {new Date(incident.openedAt).toLocaleString()}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
