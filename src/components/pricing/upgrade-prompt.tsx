"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PlanCard } from "@/components/pricing/plan-card";
import { api, type CurrentPlanResponse, type PlanRecord } from "@/lib/api";

type LimitErrorDetails = {
    error?: string;
    code?: string;
    resource?: string;
    feature?: string;
    current?: number;
    limit?: number;
    plan?: string;
    requiredPlan?: string | null;
    message?: string;
};

const ENTERPRISE_CARD: PlanRecord = {
    id: "enterprise-static",
    slug: "enterprise",
    name: "Enterprise",
    priceMonthly: 0,
    gstPercent: 18,
    priceWithGst: 0,
    currency: "INR",
    maxServers: -1,
    maxApps: -1,
    maxDatabases: -1,
    features: {
        ssl: true,
        gitDeploy: true,
        backups: true,
        alerts: true,
        rbac: true,
        auditLog: true,
        prioritySupport: true,
        monitoring: "extended",
        sso: true,
        sla: true,
        compliance: true,
    },
    isPublic: false,
    sortOrder: 4,
};

function nextPlans(currentPlan: CurrentPlanResponse["plan"] | undefined, publicPlans: PlanRecord[]) {
    if (!currentPlan) {
        return publicPlans;
    }

    const order = ["free", "starter", "pro", "business", "enterprise"];
    const currentIndex = order.indexOf(currentPlan.slug);
    return [...publicPlans, ENTERPRISE_CARD].filter((plan) => order.indexOf(plan.slug) > currentIndex).slice(0, 3);
}

export function UpgradePrompt({
    open,
    onOpenChange,
    details,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    details: LimitErrorDetails | null;
}) {
    const { data: plansData } = useQuery({
        queryKey: ["plans", "public"],
        queryFn: () => api.getPlans(),
        enabled: open,
    });
    const { data: currentPlan } = useQuery({
        queryKey: ["plans", "current"],
        queryFn: () => api.getCurrentPlan(),
        enabled: open,
    });

    const comparisonPlans = useMemo(
        () => nextPlans(currentPlan?.plan, plansData?.plans || []),
        [currentPlan?.plan, plansData?.plans]
    );
    const errorCode = (details?.error || details?.code || "").toLowerCase();
    const isPlanLimit = errorCode === "plan_limit_exceeded" || errorCode === "plan_limit_reached";
    const resourceLabel = details?.resource || details?.feature || "resource";
    const planLabel = details?.plan || currentPlan?.plan?.name || "your current plan";
    const usageDetail = typeof details?.current === "number" && typeof details?.limit === "number"
        ? `Current usage: ${details.current}, limit: ${details.limit}.`
        : "Review the current usage and plan limit before continuing.";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-testid="upgrade-prompt"
                className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-5xl overflow-y-auto p-4 sm:max-w-5xl sm:p-6"
            >
                <DialogHeader className="pr-8 text-left">
                    <DialogTitle className="flex items-start gap-2 text-xl leading-tight">
                        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-chart-4" />
                        Upgrade required
                    </DialogTitle>
                    <DialogDescription className="max-w-3xl leading-6">
                        You have reached your current plan limit. Choose a higher tier to continue deploying and managing more resources.
                    </DialogDescription>
                </DialogHeader>

                <div className="rounded-lg border border-border/70 bg-secondary/30 p-4 text-sm leading-6 text-muted-foreground">
                    {isPlanLimit ? (
                        <p className="break-words">
                            You hit the {resourceLabel} limit on {planLabel}. {usageDetail}
                        </p>
                    ) : (
                        <p className="break-words">{details?.message || "The current trial state blocks new resource creation or deployments."}</p>
                    )}
                </div>

                <div data-testid="upgrade-plan-grid" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {comparisonPlans.map((plan) => (
                        <PlanCard
                            key={plan.slug}
                            plan={plan}
                            ctaLabel={plan.slug === "starter" ? "Start trial" : plan.slug === "enterprise" ? "Contact sales" : "Review tier"}
                            onSelect={() => onOpenChange(false)}
                        />
                    ))}
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button asChild className="w-full sm:w-auto">
                        <Link href="/pricing">
                            Open pricing
                            <ArrowRight className="size-4" />
                        </Link>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
