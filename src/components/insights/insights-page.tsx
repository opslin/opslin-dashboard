"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { LockedLine, Panel, Row, Section } from "@/components/media/media-rows";
import { SkeletonText } from "@/components/patterns/skeleton";
import { useDeployInsights } from "@/hooks/use-insights";
import type { DeployInsights, InsightsGroup } from "@/lib/insights-types";
import { cn } from "@/lib/utils";

const RANGES = [7, 30, 90] as const;

const PATH_LABEL: Record<string, string> = { simple: "Single app", compose: "Compose project", dil: "AI-assisted deploy" };

export function percent(rate: number | null): string {
    return rate === null ? "no result yet" : `${Math.round(rate * 100)}% worked`;
}

export function duration(ms: number | null): string | null {
    if (ms === null) return null;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

const NAMES: Record<string, string> = { php: "PHP", node: "Node.js", nodejs: "Node.js", dotnet: ".NET", nextjs: "Next.js", java: "Java", go: "Go", ruby: "Ruby", rust: "Rust", python: "Python", static: "Static site" };

export function prettyKey(key: string): string {
    if (NAMES[key.toLowerCase()]) return NAMES[key.toLowerCase()]!;
    const text = key.replace(/[_-]+/g, " ").trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function groupState(g: InsightsGroup): string {
    const parts = [`${g.total} deploy${g.total === 1 ? "" : "s"}`, percent(g.successRate)];
    const d = duration(g.avgDurationMs);
    if (d) parts.push(`${d} on average`);
    return parts.join(" · ");
}

function Skeleton() {
    return (
        <Panel aria-busy="true" aria-label="Loading deploy insights">
            <Section>
                <Row label={<SkeletonText className="h-6 w-64" />} />
                <Row label={<SkeletonText className="h-4 w-40" />} />
                <Row label={<SkeletonText className="h-4 w-48" />} />
                <Row label={<SkeletonText className="h-4 w-36" />} />
            </Section>
        </Panel>
    );
}

/** One thin bar per day. Height is the day's deploy count; the part that failed is drawn over it. */
function DailyBars({ daily }: { daily: DeployInsights["daily"] }) {
    const max = Math.max(1, ...daily.map((d) => d.total));
    return (
        <div className="flex h-16 items-end gap-1 px-5 pb-3 pt-2" role="img" aria-label={`Deploys per day, busiest day ${max}`}>
            {daily.map((d) => (
                <div key={d.day} className="relative flex-1 rounded-sm bg-primary/25" style={{ height: `${Math.max(8, (d.total / max) * 100)}%` }} title={`${d.day}: ${d.total} deploys, ${d.failed} failed`}>
                    {d.failed > 0 ? <div className="absolute inset-x-0 bottom-0 rounded-sm bg-destructive/70" style={{ height: `${(d.failed / d.total) * 100}%` }} /> : null}
                </div>
            ))}
        </div>
    );
}

export function InsightsBody({ data }: { data: DeployInsights }) {
    if (data.total === 0) {
        return (
            <Panel>
                <Section>
                    <Row label="No deploys recorded yet" state="They appear here after your next deploy" />
                </Section>
            </Panel>
        );
    }
    const headline = data.successRate === null ? "No finished deploys yet" : `${Math.round(data.successRate * 100)}% of deploys worked`;
    return (
        <Panel>
            <div className="px-5 pb-3 pt-5">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">{headline}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {data.succeeded} worked, {data.failed} failed{data.aborted > 0 ? `, ${data.aborted} stopped` : ""} in the last {data.rangeDays} days
                </p>
            </div>
            <DailyBars daily={data.daily} />
            {data.byStack.length > 0 ? (
                <Section label="By language">
                    {data.byStack.map((g) => <Row key={g.key} label={g.key === "unknown" ? "Not detected" : prettyKey(g.key)} state={groupState(g)} />)}
                </Section>
            ) : null}
            <Section label="By how it ran">
                {data.byPath.map((g) => <Row key={g.key} label={PATH_LABEL[g.key] ?? prettyKey(g.key)} state={groupState(g)} />)}
            </Section>
            {data.byRam.length > 0 ? (
                <Section label="By server memory">
                    {data.byRam.map((g) => <Row key={g.key} label={g.key === "unknown" ? "Not reported" : g.key} state={groupState(g)} />)}
                </Section>
            ) : null}
            {data.failureClasses.length > 0 ? (
                <Section label="What went wrong">
                    {data.failureClasses.map((f) => <Row key={f.key} label={prettyKey(f.key)} state={`${f.count} time${f.count === 1 ? "" : "s"}`} />)}
                </Section>
            ) : null}
            <Section label="Also">
                <Row label="Deploys that needed a retry" state={String(data.retried)} />
                <Row label="Deploys on a server with a database" state={String(data.withDatabase)} />
                {data.aiCalls > 0 ? <Row label="AI-assisted deploys" state={`${data.aiCalls} · ${(data.aiInputTokens + data.aiOutputTokens).toLocaleString()} tokens`} /> : null}
            </Section>
        </Panel>
    );
}

export function InsightsPage() {
    const [range, setRange] = useState<(typeof RANGES)[number]>(30);
    const query = useDeployInsights(range);
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
                    <BarChart3 className="size-5 text-muted-foreground" aria-hidden="true" />
                    Deploy insights
                </h1>
                <div className="inline-flex rounded-lg border border-border/70 bg-card p-0.5" role="group" aria-label="Time range">
                    {RANGES.map((r) => (
                        <button
                            key={r}
                            type="button"
                            aria-pressed={range === r}
                            onClick={() => setRange(r)}
                            className={cn("rounded-md px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                        >
                            {r} days
                        </button>
                    ))}
                </div>
            </div>
            {query.isLoading ? <Skeleton /> : null}
            {query.isError ? (
                <Panel>
                    <Section>
                        <Row label="Couldn't load deploy insights" state="Check your connection and reload the page" />
                    </Section>
                </Panel>
            ) : null}
            {query.data?.locked ? (
                <Panel>
                    <LockedLine>Deploy insights are not switched on for this organization. Ask Opslin to turn them on.</LockedLine>
                </Panel>
            ) : null}
            {query.data && !query.data.locked ? <InsightsBody data={query.data.data} /> : null}
        </div>
    );
}
