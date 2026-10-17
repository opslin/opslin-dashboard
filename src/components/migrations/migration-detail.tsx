"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { LockedLine, Panel, Row, Section } from "@/components/media/media-rows";
import { SkeletonText } from "@/components/patterns/skeleton";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useMigration } from "@/hooks/use-migrations";
import { ApiRequestError } from "@/lib/api";
import type { MigrationView } from "@/lib/migration-types";
import { cn } from "@/lib/utils";
import { Activity } from "./activity";
import { isUnwinding, statusLabel, statusTone, type Tone } from "./format";
import { FinishedPanel, LivePanel, ProblemPanel, ProgressPanel, ReadyPanel } from "./panels";
import { LiveScreen } from "./live-screen";
import { LookScreen } from "./look-screen";
import { PlanReview } from "./plan-review";
import { PracticeScreen, ReadyScreen, SwitchScreen, UnwindScreen } from "./practice-screen";
import { StageRail } from "./stage-rail";

const TONE_CLASS: Record<Tone, string> = {
    neutral: "text-muted-foreground",
    working: "text-foreground",
    good: "text-foreground",
    attention: "text-amber-700 dark:text-amber-500",
    failed: "text-destructive",
};

const WORKING = new Set(["DISCOVERING", "PROVISIONING", "TRANSFERRING", "VERIFYING", "CUTTING_OVER"]);

export function MigrationSkeleton() {
    return (
        <Panel aria-busy="true" aria-label="Loading migration">
            <Section>
                <Row label={<SkeletonText className="h-4 w-56" />} state={<SkeletonText className="h-4 w-28" />} />
            </Section>
            <Section>
                <Row label={<SkeletonText className="h-4 w-full max-w-md" />} />
                <Row label={<SkeletonText className="h-4 w-40" />} />
                <Row label={<SkeletonText className="h-4 w-48" />} />
            </Section>
        </Panel>
    );
}

export function BackLink() {
    return (
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
            <Link href="/migrations">
                <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
                All migrations
            </Link>
        </Button>
    );
}

function StatePanel({ view }: { view: MigrationView }) {
    // Moving back and cancelling run under the earlier status; show their progress, not that status's decisions.
    if (isUnwinding(view.progress.phase) && !view.finished) return <ProgressPanel view={view} />;
    switch (view.status) {
        case "PLANNED":
            return <PlanReview view={view} />;
        case "READY_FOR_CUTOVER":
            return <ReadyPanel view={view} />;
        case "OBSERVING":
            return <LivePanel view={view} />;
        case "FAILED":
        case "RECOVERY_REQUIRED":
            return <ProblemPanel view={view} />;
        case "ACCEPTED":
        case "ABORTED":
        case "ROLLED_BACK":
        case "CUTOVER_DONE":
            return <FinishedPanel view={view} />;
        default:
            return <ProgressPanel view={view} />;
    }
}

const seenKey = (id: string) => `smi-plan-seen:${id}`;

function readSeen(id: string) {
    try { return window.sessionStorage.getItem(seenKey(id)) === "1"; } catch { return false; }
}

export function MigrationBody({ view }: { view: MigrationView }) {
    // The first screen shows what each server holds and stays until the owner asks for the plan.
    const [seen, setSeen] = useState(() => (typeof window === "undefined" ? false : readSeen(view.id)));
    if (view.status === "DISCOVERING" || (view.status === "PLANNED" && !seen)) {
        return <LookScreen view={view} onContinue={() => { try { window.sessionStorage.setItem(seenKey(view.id), "1"); } catch { /* not saved */ } setSeen(true); }} />;
    }
    if (view.status === "PLANNED" && view.plan) return <PlanReview view={view} />;
    const unwinding = isUnwinding(view.progress.phase) && !view.finished;
    if (unwinding && !view.finished) return <UnwindScreen view={view} />;
    if (!unwinding && view.status === "CUTTING_OVER") return <SwitchScreen view={view} />;
    if (!unwinding && ["PROVISIONING", "TRANSFERRING", "VERIFYING"].includes(view.status)) return <PracticeScreen view={view} />;
    if (!unwinding && view.status === "READY_FOR_CUTOVER") return <ReadyScreen view={view} />;
    if (!unwinding && (view.status === "OBSERVING" || view.status === "ACCEPTED")) return <LiveScreen view={view} />;
    const tone = statusTone(view.status, view.progress.phase);
    return (
        <Panel>
            <Section>
                <Row
                    label={
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate">{view.source.name}</span>
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-label="to" />
                            <span className="truncate">{view.target.name}</span>
                        </span>
                    }
                    state={<span className={cn("font-medium", TONE_CLASS[tone])}>{statusLabel(view.status, view.progress.phase)}</span>}
                />
            </Section>
            <Section>
                <StageRail stages={view.stages} working={WORKING.has(view.status) || unwinding} />
            </Section>
            <StatePanel view={view} />
            <Activity events={view.events} />
        </Panel>
    );
}

export function MigrationDetail({ id }: { id: string }) {
    const query = useMigration(id);

    if (query.isLoading) {
        return <MigrationSkeleton />;
    }
    if (query.error) {
        const locked = query.error instanceof ApiRequestError && query.error.status === 403;
        const missing = query.error instanceof ApiRequestError && query.error.status === 404;
        return (
            <Panel>
                <Section>
                    <Row
                        leading={locked ? <Lock className="size-4 text-muted-foreground" aria-hidden="true" /> : undefined}
                        label={locked ? "Migration isn't turned on for this organization" : missing ? "This migration doesn't exist" : "Couldn't load this migration"}
                        action={
                            missing || locked ? undefined : (
                                <Button variant="outline" onClick={() => void query.refetch()}>
                                    Try again
                                </Button>
                            )
                        }
                    />
                    {locked ? <LockedLine>Only Opslin can turn it on during early access.</LockedLine> : null}
                </Section>
            </Panel>
        );
    }
    return <MigrationBody view={query.data!} />;
}
