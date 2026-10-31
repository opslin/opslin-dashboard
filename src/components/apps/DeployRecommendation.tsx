"use client";

import { ChevronRight, Compass, Package, Server as ServerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonText } from "@/components/patterns/skeleton";
import type { DeployRecommendationData, DeployRoute, FitAssessmentData } from "@/lib/deploy-route-types";
import { cn } from "@/lib/utils";
import { PlanPreviewRows, planBlocksDeploy } from "./PlanPreview";

/** The way the wizard will deploy: Opslin AI, or the standard build. */
export type ChosenWay = "ai" | "standard" | "image";

const LABEL: Record<DeployRoute, string> = {
    simple: "Standard deploy",
    compose: "Standard deploy of the compose project",
    ai: "AI-assisted deploy",
};

export const recommendedWay = (route: DeployRoute): ChosenWay => (route === "ai" ? "ai" : "standard");

const gb = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);

/** Whether the chosen server is big enough: a flat row, amber (never red) when tight or too small (DESIGN.md C5). */
export function ServerFitRow({ fit }: { fit: FitAssessmentData }) {
    const state = fit.available ? `Needs about ${gb(fit.required.ramMb)} · ${gb(fit.available.ramMb)} free` : "No numbers from this server yet";
    return (
        <div className="border-t">
            <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <ServerIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className={cn("min-w-40 flex-1 text-sm font-medium [overflow-wrap:anywhere]", fit.level === "tight" || fit.level === "too_small" ? "text-warning-text" : "text-foreground")}>{fit.headline}</span>
                <span className="text-sm text-muted-foreground">{state}</span>
            </div>
            <details className="group border-t">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                    Why
                </summary>
                <ul className="space-y-1.5 px-4 pb-3 pl-10 text-sm text-muted-foreground">
                    {fit.reasons.map((reason) => <li key={reason} className="[overflow-wrap:anywhere]">{reason}</li>)}
                    {fit.recommendation ? <li className="font-medium text-foreground [overflow-wrap:anywhere]">{fit.recommendation}</li> : null}
                </ul>
            </details>
        </div>
    );
}

/**
 * One flat row (DESIGN.md S2): the recommended way on the left, the confidence on the right, at most one action. The
 * reasons sit behind a collapsed "Why" row (P3). Shows nothing while locked, and a quiet line when the repo can't be read.
 */
export function DeployRecommendation({
    state,
    chosen,
    onChoose,
    disabled,
    fit,
}: {
    fit?: FitAssessmentData | null;
    state: { status: "loading" } | { status: "error" } | { status: "ready"; data: DeployRecommendationData };
    chosen: ChosenWay;
    onChoose: (way: ChosenWay) => void;
    disabled?: boolean;
}) {
    if (state.status === "loading") {
        return (
            <div aria-busy="true" aria-label="Checking the best way to deploy" className="flex min-h-12 items-center gap-3 rounded-xl border px-4 py-2.5">
                <Compass className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <SkeletonText className="h-4 w-56" />
            </div>
        );
    }
    if (state.status === "error") {
        return (
            <p className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm text-muted-foreground" role="status">
                <Compass className="size-4 shrink-0" aria-hidden="true" />
                Couldn&apos;t check this repository. You can still deploy it.
            </p>
        );
    }

    const { data } = state;
    const best = recommendedWay(data.route);
    const differs = chosen !== best;  // choosing the official image also offers a way back to the recommended build
    const officialRow = data.officialImage ? (
        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2.5">
            <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-40 flex-1 text-sm font-medium text-foreground [overflow-wrap:anywhere]">Official image: {data.officialImage.image}:{data.officialImage.tag}</span>
            <span className="text-sm text-muted-foreground">{chosen === "image" ? "Selected" : "Ready to use, no build"}</span>
            {chosen !== "image" ? (
                <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChoose("image")}>Use official image</Button>
            ) : null}
        </div>
    ) : null;
    // A plan Opslin cannot run is the only thing to show: "best way" and "confident" would promise a deploy that cannot happen.
    if (chosen === "ai" && data.plan && planBlocksDeploy(data.plan)) {
        return <div className="rounded-xl border [&>div:first-child]:border-t-0"><PlanPreviewRows plan={data.plan} />{officialRow}</div>;
    }
    return (
        <div className="rounded-xl border">
            <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                <Compass className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-40 flex-1 text-sm font-medium text-foreground [overflow-wrap:anywhere]">Best way: {LABEL[data.route]}</span>
                <span className={cn("text-sm", data.confidence === "low" ? "text-warning-text" : "text-muted-foreground")}>
                    {data.confidence === "low" ? "Not sure, check it" : "Confident"}
                </span>
                {differs ? (
                    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChoose(best)}>
                        {best === "ai" ? "Use AI-assisted deploy" : "Use standard deploy"}
                    </Button>
                ) : null}
            </div>
            <details className="group border-t">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                    Why
                </summary>
                <ul className="space-y-1.5 px-4 pb-3 pl-10 text-sm text-muted-foreground">
                    {data.reasons.map((reason) => (
                        <li key={reason} className="[overflow-wrap:anywhere]">{reason}</li>
                    ))}
                </ul>
            </details>
            {officialRow}
            {fit ? <ServerFitRow fit={fit} /> : null}
            {chosen === "ai" && data.plan ? <PlanPreviewRows plan={data.plan} /> : null}
        </div>
    );
}
