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
            className={trial.warningLevel ? "bg-warning-muted text-warning-text" : "bg-accent-2-muted text-accent-2"}
        >
            Trial: {trial.daysRemaining} days left
        </Badge>
    );
}
