"use client";

import { Badge } from "@/components/ui/badge";
import type { TrialStatusResponse } from "@/lib/api";

export function TrialBadge({ trial }: { trial: TrialStatusResponse | null | undefined }) {
    if (!trial) {
        return null;
    }

    if (trial.isExpired) {
        return (
            <Badge data-testid="trial-badge" className="bg-destructive/15 text-destructive">
                Trial ended
            </Badge>
        );
    }

    if (trial.status !== "trialing" || trial.daysRemaining === null) {
        return null;
    }

    return (
        <Badge
            data-testid="trial-badge"
            className="h-8 border-warning/30 bg-warning-muted px-3 text-[13px] font-medium text-warning-text"
        >
            {trial.daysRemaining} {trial.daysRemaining === 1 ? "day" : "days"} left in trial
        </Badge>
    );
}
