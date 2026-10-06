"use client";

import { Check, Clock, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaStepRecord, MediaStepStatus } from "@/lib/api";

/** Names people recognize (docs/audit/27 C3) — never "bucket binding" or "Worker" in the default view. */
export const MEDIA_STEP_LABELS: Record<string, string> = {
    verify_access: "Check access",
    bucket: "Create storage",
    upload_worker: "Upload service",
    custom_domain: "Connect domain",
    zone_rules: "Caching rules",
    bucket_cors: "Browser access",
    smoke_test: "Test upload",
};

export const MEDIA_STEP_ORDER = [
    "verify_access",
    "bucket",
    "upload_worker",
    "custom_domain",
    "zone_rules",
    "bucket_cors",
    "smoke_test",
] as const;

/** The rows shown before anything has run, so the layout never changes shape when setup starts. */
export function notStartedSteps(): MediaStepRecord[] {
    return MEDIA_STEP_ORDER.map((step) => ({ step, status: "PENDING", attempts: 0, detail: null, finishedAt: null }));
}

function detailMessage(detail: unknown): string | null {
    if (detail && typeof detail === "object" && "message" in detail) {
        const message = (detail as { message?: unknown }).message;
        return typeof message === "string" && message.length > 0 ? message : null;
    }
    return null;
}

export function detailNeed(detail: unknown): string | null {
    if (detail && typeof detail === "object" && "need" in detail) {
        const need = (detail as { need?: unknown }).need;
        return typeof need === "string" ? need : null;
    }
    return null;
}

/** The state line for a row: reports what is true, never explains the interface (P1). */
export function describeStep(step: MediaStepRecord, notStarted = false): string {
    switch (step.status) {
        case "DONE":
            return "Done";
        case "RUNNING":
            return "Working";
        case "FAILED":
            return detailMessage(step.detail) ?? "Didn't finish";
        case "NEEDS_INPUT":
            {
                const need = detailNeed(step.detail);
                return need === "domain" ? "Needs a domain" : need === "r2" ? "Turn on R2 in Cloudflare" : "Needs your input";
            }
        case "WAITING":
            return "Waiting for Cloudflare";
        default:
            return notStarted ? "Not started" : "Waiting";
    }
}

function StepIcon({ status }: { status: MediaStepStatus }) {
    const base = "flex size-6 shrink-0 items-center justify-center rounded-full";
    switch (status) {
        case "DONE":
            return (
                <span className={cn(base, "bg-success-muted text-success-text")}>
                    <Check className="size-3.5" aria-hidden="true" />
                </span>
            );
        case "RUNNING":
            return (
                <span className={cn(base, "bg-brand-muted text-brand")}>
                    <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
                </span>
            );
        case "FAILED":
            return (
                <span className={cn(base, "bg-danger-muted text-danger-text")}>
                    <X className="size-3.5" aria-hidden="true" />
                </span>
            );
        // Blocked is not an error (C5): neutral ink, no red.
        case "NEEDS_INPUT":
        case "WAITING":
            return (
                <span className={cn(base, "bg-secondary text-muted-foreground")}>
                    <Clock className="size-3.5" aria-hidden="true" />
                </span>
            );
        default:
            return <span className={cn(base, "border border-border")} aria-hidden="true" />;
    }
}

/** Compact, flat rows (S2): icon + label left, current state right, hairline dividers. */
export function MediaStepRail({ steps, notStarted = false }: { steps: MediaStepRecord[]; notStarted?: boolean }) {
    return (
        <ol aria-label="Setup progress" className="divide-y divide-border/70">
            {steps.map((step) => {
                const failed = step.status === "FAILED";
                const text = describeStep(step, notStarted);
                return (
                    <li key={step.step} className="flex min-h-11 items-center gap-3 px-5 py-2.5">
                        <StepIcon status={step.status} />
                        <span className="flex-1 text-sm text-foreground">{MEDIA_STEP_LABELS[step.step] ?? step.step}</span>
                        <span
                            aria-live="polite"
                            // A failure's reason is what the person needs to read: let it wrap instead of truncating.
                            className={cn(
                                "max-w-[55%] text-right text-sm",
                                failed ? "break-words text-danger-text" : "truncate text-muted-foreground"
                            )}
                            title={text}
                        >
                            {text}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
