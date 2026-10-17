"use client";

import { ChevronRight } from "lucide-react";
import type { MigrationView } from "@/lib/migration-types";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = { error: "bg-destructive", warn: "bg-amber-500", stage: "bg-primary", item: "bg-emerald-500", info: "bg-muted-foreground/50" };

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * What happened, newest first, in a box of fixed height that scrolls inside itself, so a long migration never makes the page long.
 * Collapsed by default (DESIGN.md P3): the answer is the state above, not this list.
 */
export function Activity({ events }: { events: MigrationView["events"] }) {
    if (events.length === 0) return null;
    const newest = [...events].reverse();
    return (
        <details className="group border-t border-border/70 first:border-t-0">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 transition-transform duration-150 motion-reduce:transition-none group-open:rotate-90" aria-hidden="true" />
                <span>Activity</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{events.length}</span>
            </summary>
            <div className="mx-5 mb-4 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-muted/20" tabIndex={0} role="region" aria-label="Activity log">
                <ol className="divide-y divide-border/50 text-sm">
                    {newest.map((event) => (
                        <li key={event.id} className={cn("flex items-start gap-3 px-3.5 py-2", event.kind === "error" ? "text-destructive" : event.kind === "warn" ? "text-amber-700 dark:text-amber-500" : "text-foreground")}>
                            <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[event.kind] ?? DOT.info)} />
                            <time className="w-16 shrink-0 font-mono text-xs leading-5 tabular-nums text-muted-foreground" dateTime={event.at} title={new Date(event.at).toLocaleString()}>{clock(event.at)}</time>
                            <span className="min-w-0 flex-1 break-words">{event.message}</span>
                        </li>
                    ))}
                </ol>
            </div>
        </details>
    );
}
