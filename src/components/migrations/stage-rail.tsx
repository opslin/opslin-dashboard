"use client";

import { Check, Loader2, TriangleAlert, X } from "lucide-react";
import type { MigrationStage, StageId } from "@/lib/migration-types";
import { cn } from "@/lib/utils";

const COPY: Record<StageId, { title: string; hint: string }> = {
    look: { title: "Look", hint: "Check both servers" },
    plan: { title: "Plan", hint: "Review what moves" },
    practice: { title: "Practice", hint: "Try it safely" },
    switch: { title: "Switch", hint: "Move the apps" },
    live: { title: "Live", hint: "All set" },
};

/**
 * The five steps of a migration: a numbered circle, a short title and a hint, joined by a line.
 * Done steps are a green check, the current step is filled, the rest are quiet. On a phone only the circles and titles show.
 */
export function StageRail({ stages, working }: { stages: MigrationStage[]; working: boolean }) {
    return (
        <ol aria-label="Migration progress" className="flex items-start px-5 py-4">
            {stages.map((stage, i) => {
                const copy = COPY[stage.id];
                const last = i === stages.length - 1;
                return (
                    <li key={stage.id} aria-current={stage.state === "current" ? "step" : undefined} aria-label={`${copy.title}: ${stateWord(stage.state)}`} className={cn("flex items-start", last ? "shrink-0" : "min-w-0 flex-1")}>
                        <div className="flex shrink-0 flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                            <Mark n={i + 1} state={stage.state} working={working} />
                            <div className="text-center sm:text-left">
                                <p className={cn("text-sm font-medium", stage.state === "pending" ? "text-muted-foreground" : "text-foreground", stage.state === "current" && "text-primary", stage.state === "failed" && "text-destructive", stage.state === "attention" && "text-amber-700 dark:text-amber-500")}>{copy.title}</p>
                                <p className="hidden text-xs text-muted-foreground lg:block">{copy.hint}</p>
                            </div>
                        </div>
                        {last ? null : <span aria-hidden="true" className={cn("mx-3 mt-4 h-px min-w-3 flex-1 sm:mt-[17px]", stage.state === "done" ? "bg-emerald-500/60" : "bg-border")} />}
                    </li>
                );
            })}
        </ol>
    );
}

function stateWord(state: MigrationStage["state"]) {
    return state === "done" ? "done" : state === "current" ? "current" : state === "failed" ? "stopped" : state === "attention" ? "needs your decision" : "not started";
}

function Mark({ n, state, working }: { n: number; state: MigrationStage["state"]; working: boolean }) {
    const base = "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold";
    if (state === "done") return <span className={cn(base, "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400")}><Check className="size-4" aria-hidden="true" /></span>;
    if (state === "failed") return <span className={cn(base, "bg-destructive/10 text-destructive")}><X className="size-4" aria-hidden="true" /></span>;
    if (state === "attention") return <span className={cn(base, "bg-amber-500/15 text-amber-700 dark:text-amber-500")}><TriangleAlert className="size-4" aria-hidden="true" /></span>;
    if (state === "current") {
        return <span className={cn(base, "bg-primary text-primary-foreground")}>{working ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : n}</span>;
    }
    return <span className={cn(base, "bg-muted text-muted-foreground")}>{n}</span>;
}
