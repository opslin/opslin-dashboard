"use client";

/**
 * PreflightChecksPanel — FIS Phase 0+1 (docs/audit/07, docs/audit/14 Phase 3
 * step 7 + Phase 4 step 7). Read-only pass/warn/block list with evidence,
 * plus an advisory risk-score badge (LOW/MEDIUM/HIGH — HIGH never blocks by
 * itself, only recommends caution). When a check is both BLOCK and the
 * current user's role allows overriding it, an "Override and deploy anyway"
 * action is offered. Renders nothing when there are no checks (the common
 * case — feature is off by default, or everything PASS).
 */

import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import type { PreflightCheck, RiskScoreResult } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PreflightChecksPanelProps {
    checks: PreflightCheck[];
    deniedOverrides?: string[];
    orgRole: string | null | undefined;
    onOverrideAndDeploy?: (checkIds: string[]) => void;
    pending?: boolean;
    className?: string;
    riskScore?: RiskScoreResult | null;
}

const resultStyles: Record<PreflightCheck["result"], string> = {
    PASS: "bg-success-muted text-success-text",
    WARN: "bg-warning-muted text-warning-text",
    BLOCK: "bg-danger-muted text-danger-text",
};

const riskLevelStyles: Record<RiskScoreResult["level"], string> = {
    LOW: "bg-success-muted text-success-text",
    MEDIUM: "bg-warning-muted text-warning-text",
    HIGH: "bg-danger-muted text-danger-text",
};

function canOverride(checkId: string, orgRole: string | null | undefined): boolean {
    if (!orgRole) return false;
    if (checkId === "P-06") return orgRole === "OWNER";
    return orgRole === "OWNER" || orgRole === "ADMIN";
}

export function PreflightChecksPanel({
    checks,
    deniedOverrides = [],
    orgRole,
    onOverrideAndDeploy,
    pending = false,
    className,
    riskScore,
}: PreflightChecksPanelProps): ReactElement | null {
    if (checks.length === 0 && !riskScore) {
        return null;
    }

    const blockedChecks = checks.filter((c) => c.result === "BLOCK");
    const overridableBlocked = blockedChecks.filter((c) => canOverride(c.id, orgRole));

    return (
        <div className={cn("space-y-2 rounded-md border p-3", className)}>
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Preflight checks</h3>
                {riskScore ? (
                    <span
                        className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            riskLevelStyles[riskScore.level]
                        )}
                        title={riskScore.reasons.join("; ") || "No significant risk signals"}
                    >
                        RISK: {riskScore.level}
                    </span>
                ) : null}
            </div>
            {riskScore && riskScore.reasons.length > 0 ? (
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {riskScore.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                    ))}
                </ul>
            ) : null}
            <ul className="space-y-1.5">
                {checks.map((check) => (
                    <li key={check.id} className="flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                            <span className="font-mono text-xs text-muted-foreground">{check.id}</span>{" "}
                            <span className="text-muted-foreground">{check.evidence}</span>
                            {deniedOverrides.includes(check.id) ? (
                                <p className="text-xs text-danger-text">
                                    You don&apos;t have permission to override this check.
                                </p>
                            ) : null}
                        </div>
                        <span
                            className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                resultStyles[check.result]
                            )}
                        >
                            {check.result}
                        </span>
                    </li>
                ))}
            </ul>
            {blockedChecks.length > 0 && overridableBlocked.length === blockedChecks.length && onOverrideAndDeploy ? (
                <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onOverrideAndDeploy(blockedChecks.map((c) => c.id))}
                >
                    Override and deploy anyway
                </Button>
            ) : null}
        </div>
    );
}
