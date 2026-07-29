"use client";

/**
 * ServerDriftPanel — CSF drift findings (docs/audit/06, docs/audit/14).
 *
 * Behaviour:
 *   - Fetches `GET /servers/:id/drift` via TanStack Query, refreshing every
 *     60 seconds.
 *   - Feature-gated behind "csf.driftDetection" — a 403 means the org hasn't
 *     opted in, so the panel renders nothing (not an error state).
 *   - Renders an "all clear" message when there are no open findings.
 *   - ADMIN+ users see a one-click reconcile button (with confirmation) on
 *     APP_RUNTIME/NGINX/SSL findings only — FIREWALL is never reconcilable
 *     here (SSH lockout risk, detect-and-alert only), and DATABASE/ENV have
 *     no reconcile action in this phase either. STALE findings (agent
 *     offline) never show a reconcile control.
 */

import { useState, type ReactElement } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiRequestError, api, type DriftFinding } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface ServerDriftPanelProps {
    serverId: string;
    className?: string;
}

const severityStyles: Record<DriftFinding["severity"], string> = {
    CRIT: "bg-danger-muted text-danger-text",
    WARN: "bg-warning-muted text-warning-text",
    INFO: "bg-info-muted text-info-text",
};

const statusLabels: Record<DriftFinding["status"], string> = {
    OPEN: "Open",
    ACKNOWLEDGED: "Acknowledged",
    RECONCILED: "Reconciled",
    IGNORED: "Ignored",
    STALE: "Stale (agent offline)",
};

const domainLabels: Record<DriftFinding["domain"], string> = {
    APP_RUNTIME: "App runtime",
    NGINX: "Nginx",
    SSL: "SSL",
    FIREWALL: "Firewall",
    DATABASE: "Database",
    ENV: "Environment",
};

// Only these domains have a reconcile action in this phase (docs/audit/06
// "Reconciliation rules" — FIREWALL is never reconcilable here; DATABASE and
// ENV have no defined reconcile action either, detect-and-alert only).
const RECONCILABLE_DOMAINS = new Set<DriftFinding["domain"]>(["APP_RUNTIME", "NGINX", "SSL"]);
const RECONCILABLE_STATUSES = new Set<DriftFinding["status"]>(["OPEN", "ACKNOWLEDGED"]);

function DriftBadge({ finding }: { finding: DriftFinding }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                severityStyles[finding.severity]
            )}
        >
            {finding.severity}
        </span>
    );
}

export function ServerDriftPanel({ serverId, className }: ServerDriftPanelProps): ReactElement | null {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [pendingFinding, setPendingFinding] = useState<DriftFinding | null>(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ["server-drift", serverId],
        queryFn: () => api.getServerDrift(serverId),
        refetchInterval: 60_000,
        enabled: Boolean(serverId),
        retry: (failureCount, err) => {
            if (err instanceof ApiRequestError && err.status === 403) {
                return false;
            }
            return failureCount < 2;
        },
    });

    const reconcileMutation = useMutation({
        mutationFn: (findingId: string) => api.reconcileServerDrift(serverId, findingId),
        onSuccess: () => {
            toast.success("Reconcile job enqueued");
            queryClient.invalidateQueries({ queryKey: ["server-drift", serverId] });
        },
        onError: (e: unknown) => {
            toast.error(e instanceof Error ? e.message : "Reconcile failed");
        },
        onSettled: () => setPendingFinding(null),
    });

    // Feature not opted in for this org — render nothing rather than an error.
    if (error instanceof ApiRequestError && error.status === 403) {
        return null;
    }

    if (isLoading) {
        return null;
    }

    if (error || !data) {
        return null;
    }

    const canReconcile = user?.orgRole === "OWNER" || user?.orgRole === "ADMIN";

    return (
        <Card className={className}>
            <CardHeader>
                <h2 className="text-base font-semibold leading-none">Drift</h2>
            </CardHeader>
            <CardContent>
                {data.findings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No drift detected — desired and observed state match.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {data.findings.map((finding) => {
                            const showReconcile =
                                canReconcile &&
                                RECONCILABLE_DOMAINS.has(finding.domain) &&
                                RECONCILABLE_STATUSES.has(finding.status);

                            return (
                                <li
                                    key={finding.id}
                                    className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-medium">{domainLabels[finding.domain]}</p>
                                        <p className="truncate text-xs text-muted-foreground">{finding.path}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            {statusLabels[finding.status]}
                                        </span>
                                        <DriftBadge finding={finding} />
                                        {showReconcile ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={reconcileMutation.isPending}
                                                onClick={() => setPendingFinding(finding)}
                                            >
                                                Reconcile
                                            </Button>
                                        ) : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </CardContent>

            <AlertDialog open={pendingFinding !== null} onOpenChange={(open) => !open && setPendingFinding(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Reconcile {pendingFinding ? domainLabels[pendingFinding.domain] : ""} drift?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingFinding?.path} — this enqueues the existing job for this domain (restart, nginx
                            re-apply, or SSL reissue). Every reconcile is audit-logged.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={reconcileMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={reconcileMutation.isPending}
                            onClick={() => pendingFinding && reconcileMutation.mutate(pendingFinding.id)}
                        >
                            Confirm Reconcile
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
