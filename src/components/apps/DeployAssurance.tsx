"use client";

import { ChevronRight, CircleCheck, CircleDashed } from "lucide-react";

export type DeployAssuranceData = { level: "application_verified" | "technical_release"; limits: string[] };

/**
 * What a finished AI-assisted deploy actually proved (API doc 64 S3.6): one flat row (DESIGN.md S2), and for a
 * technical release the unproven items behind a collapsed row (P3). Neutral, not red: running but unproven is not a
 * failure (C5). Nothing for an older result that has no level.
 */
export function DeployAssurance({ assurance }: { assurance: DeployAssuranceData | null | undefined }) {
    if (!assurance) return null;
    if (assurance.level === "application_verified") {
        return (
            <div className="flex min-h-12 items-center gap-3 rounded-xl border px-4 py-2.5 text-left">
                <CircleCheck className="size-4 shrink-0 text-success-text" aria-hidden="true" />
                <span className="flex-1 text-sm font-medium text-foreground">Verified</span>
                <span className="text-sm text-muted-foreground">Uses its databases, every check passed</span>
            </div>
        );
    }
    const count = assurance.limits.length;
    return (
        <details className="group rounded-xl border text-left">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-sm font-medium text-foreground">Running</span>
                <span className="text-sm text-muted-foreground">{count === 1 ? "1 thing not proven" : `${count} things not proven`}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
            </summary>
            <ul className="space-y-1.5 border-t px-4 py-3 pl-11 text-sm text-muted-foreground">
                {assurance.limits.map((limit) => <li key={limit} className="[overflow-wrap:anywhere]">{limit}</li>)}
            </ul>
        </details>
    );
}
