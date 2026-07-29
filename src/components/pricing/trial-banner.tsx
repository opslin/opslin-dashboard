"use client";

import Link from "next/link";
import { AlertTriangle, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrialStatusResponse } from "@/lib/api";

export function TrialBanner({ trial }: { trial: TrialStatusResponse | null | undefined }) {
    if (!trial) {
        return null;
    }

    if (!trial.isExpired && !trial.warningLevel) {
        return null;
    }

    const copy = trial.isExpired
        ? {
            title: "Starter trial expired",
            detail: trial.isInGracePeriod
                ? `You are in the 14-day grace window. New deploys and resource creation are blocked until you upgrade.`
                : "The trial expired and the organization is waiting for downgrade handling.",
        }
        : trial.warningLevel === "1d"
            ? {
                title: "Starter trial ends tomorrow",
                detail: "Upgrade now to avoid deployment and creation blocks when the trial closes.",
            }
            : {
                title: "Starter trial ends in 7 days",
                detail: "Review plan limits and move to a paid tier before the grace window begins.",
            };

    return (
        <div data-testid="trial-banner" className="dashboard-page pb-0">
            <div className="flex flex-col gap-4 rounded-2xl border border-chart-4/30 bg-chart-4/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    {trial.isExpired ? (
                        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                    ) : (
                        <Clock3 className="mt-0.5 size-5 shrink-0 text-chart-4" />
                    )}
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{copy.title}</p>
                        <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{copy.detail}</p>
                    </div>
                </div>
                <Button asChild size="sm" className="w-full sm:w-auto">
                    <Link href="/pricing">Review pricing</Link>
                </Button>
            </div>
        </div>
    );
}
