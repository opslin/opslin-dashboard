"use client";

import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, HelpCircle, Loader2, RefreshCw, Server as ServerIcon, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function NoServersState({ onHelp }: { onHelp: () => void }) {
    return (
        <div className="flex min-h-[55vh] items-center justify-center">
            <div className="max-w-md rounded-2xl border bg-card p-10 text-center shadow-xs">
                <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ServerIcon className="size-8" aria-hidden="true" /></span>
                <h1 className="text-xl font-bold text-foreground">Connect a server to start monitoring</h1>
                <p className="mt-2 text-sm text-muted-foreground">Opslin shows CPU, memory, disk and network as soon as your server connects.</p>
                <Button asChild className="mt-6"><Link href="/servers/connect">Connect a server</Link></Button>
                <div className="mt-3">
                    <button type="button" onClick={onHelp} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">How does this work?<ArrowRight className="size-3.5" aria-hidden="true" /></button>
                </div>
            </div>
        </div>
    );
}

const STEPS = [
    { label: "Agent connected", state: "Done" },
    { label: "Collecting metrics", state: "In progress" },
    { label: "First chart ready", state: "Next" },
] as const;

export function WaitingState() {
    return (
        <div className="flex min-h-[45vh] items-center justify-center">
            <Card className="w-full max-w-xl gap-0 rounded-2xl p-8 shadow-xs">
                <div className="flex items-start gap-5">
                    <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-success-muted text-success-text ring-8 ring-success-muted/50"><Check className="size-7" aria-hidden="true" /></span>
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Your server is connected</h2>
                        <p className="mt-1 text-sm text-muted-foreground">The first numbers arrive within a minute. This page updates by itself.</p>
                    </div>
                </div>
                <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Collecting the first metrics" aria-valuetext="In progress">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
                </div>
                <ol className="mt-5 space-y-3">
                    {STEPS.map((step, index) => (
                        <li key={step.label} className="flex items-center gap-3 text-sm">
                            <span className={cn("flex size-7 items-center justify-center rounded-full text-xs font-semibold", step.state === "Done" ? "bg-success-muted text-success-text" : step.state === "In progress" ? "bg-primary/10 text-primary" : "border bg-background text-muted-foreground")}>
                                {step.state === "Done" ? <Check className="size-4" aria-hidden="true" /> : step.state === "In progress" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : index + 1}
                            </span>
                            <span className="flex-1 font-medium text-foreground">{step.label}</span>
                            <span className="text-xs text-muted-foreground">{step.state}</span>
                        </li>
                    ))}
                </ol>
            </Card>
        </div>
    );
}

export type LastKnown = { cpu: number; memory: number; disk: number } | null;

export function OfflineState({ title, detail, lastKnown, fixHref, onReconnect }: { title: string; detail: string; lastKnown: LastKnown; fixHref: string; onReconnect: () => void }) {
    const tiles = [
        { label: "CPU", value: lastKnown?.cpu },
        { label: "Memory", value: lastKnown?.memory },
        { label: "Disk", value: lastKnown?.disk },
    ];
    return (
        <Card className="gap-0 rounded-2xl p-6 shadow-xs">
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-muted px-4 py-3 text-danger-text">
                <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                    <p className="font-semibold">{title}</p>
                    <p className="text-sm">{detail}</p>
                </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={onReconnect} className="bg-foreground text-background hover:bg-foreground/90"><RefreshCw aria-hidden="true" />Reconnect</Button>
                <Button asChild variant="outline"><Link href={fixHref}><HelpCircle aria-hidden="true" />Show how to fix</Link></Button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {tiles.map((tile) => (
                    <div key={tile.label} className="rounded-xl border bg-muted/30 p-4 text-muted-foreground">
                        <p className="text-sm font-medium">{tile.label}</p>
                        <p className="mt-2 text-2xl font-bold">—</p>
                        <p className="mt-2 text-xs">{tile.value === undefined ? "No data yet" : `Last known: ${Math.round(tile.value)}%`}</p>
                    </div>
                ))}
            </div>
            <div className="mt-5 border-t border-dashed" aria-hidden="true" />
            <p className="mt-3 text-center text-xs text-muted-foreground">No data while offline</p>
        </Card>
    );
}

export function StaleBanner({ minutes, onRetry }: { minutes: number; onRetry: () => void }) {
    return (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-muted px-4 py-3 text-warning-text">
            <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p className="font-semibold">Showing data from {minutes} minutes ago</p>
                <p className="text-sm">We&apos;re having trouble reaching the agent.</p>
            </div>
            <Button size="sm" variant="outline" onClick={onRetry} className="bg-background text-foreground"><RefreshCw aria-hidden="true" />Retry</Button>
        </div>
    );
}

export function AllGood() {
    return <CheckCircle2 className="size-5 text-success" aria-hidden="true" />;
}
