"use client";

import { Check, InfinityIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlanRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

const FEATURE_LABELS: Array<keyof PlanRecord["features"]> = [
    "ssl",
    "gitDeploy",
    "backups",
    "alerts",
    "rbac",
    "auditLog",
    "prioritySupport",
    "sso",
    "sla",
    "compliance",
];

function formatLimit(value: number) {
    return value === -1 ? "Unlimited" : String(value);
}

function formatMoney(value: number) {
    return `₹${value.toLocaleString("en-IN")}`;
}

function featureLabel(feature: string) {
    switch (feature) {
        case "gitDeploy":
            return "Git deploy";
        case "auditLog":
            return "Audit log";
        case "prioritySupport":
            return "Priority support";
        default:
            return feature
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .replace(/^./, (value) => value.toUpperCase());
    }
}

export function PlanCard({
    plan,
    isCurrent = false,
    onSelect,
    ctaLabel,
    disabled = false,
    featured = false,
}: {
    plan: PlanRecord;
    isCurrent?: boolean;
    onSelect?: () => void;
    ctaLabel: string;
    disabled?: boolean;
    featured?: boolean;
}) {
    const enabledFeatures = FEATURE_LABELS.filter((feature) => Boolean(plan.features?.[feature]));
    const monitoringTier = String(plan.features?.monitoring || "basic");

    return (
        <Card
            data-testid={`plan-card-${plan.slug}`}
            className={cn(
                "flex h-full min-w-0 flex-col gap-5 border-border/70 py-5 sm:gap-6 sm:py-6",
                featured ? "border-primary shadow-sm" : "bg-card"
            )}
        >
            <CardHeader className="space-y-4 px-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <CardTitle className="break-words text-xl leading-tight">{plan.name}</CardTitle>
                        <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">
                            {formatLimit(plan.maxServers)} servers, {formatLimit(plan.maxApps)} apps, {formatLimit(plan.maxDatabases)} databases
                        </p>
                    </div>
                    {isCurrent ? (
                        <Badge data-testid={`plan-current-${plan.slug}`} className="shrink-0 whitespace-nowrap bg-primary/15 text-primary">
                            Current
                        </Badge>
                    ) : null}
                </div>

                <div className="space-y-1">
                    {plan.slug === "enterprise" ? (
                        <>
                            <p className="break-words text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Custom</p>
                            <p className="text-sm leading-5 text-muted-foreground">Custom pricing and GST handled in the quote.</p>
                        </>
                    ) : (
                        <>
                            <p className="break-words text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{formatMoney(plan.priceMonthly)}</p>
                            {plan.priceMonthly > 0 ? (
                                <>
                                    <p className="break-words text-sm leading-5 text-muted-foreground">+ {formatMoney(plan.priceWithGst - plan.priceMonthly)} GST ({plan.gstPercent}%)</p>
                                    <p className="break-words text-base font-medium leading-6 text-foreground">{formatMoney(plan.priceWithGst)}/month total</p>
                                </>
                            ) : (
                                <p className="text-sm leading-5 text-muted-foreground">No GST on the Free plan.</p>
                            )}
                        </>
                    )}
                </div>

                {plan.slug === "starter" ? (
                    <Badge data-testid="starter-trial-badge" className="w-fit whitespace-nowrap bg-chart-5/15 text-chart-5">
                        6 Months Free
                    </Badge>
                ) : null}
            </CardHeader>

            <CardContent className="flex-1 space-y-4 px-4 sm:px-6">
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 bg-secondary/30 p-3 text-xs sm:text-sm xl:grid-cols-3 xl:gap-3">
                    <div className="min-w-0">
                        <p className="text-muted-foreground">Servers</p>
                        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1 break-words font-medium text-foreground">
                            {plan.maxServers === -1 ? <InfinityIcon className="size-4 shrink-0" /> : null}
                            {formatLimit(plan.maxServers)}
                        </p>
                    </div>
                    <div className="min-w-0">
                        <p className="text-muted-foreground">Apps</p>
                        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1 break-words font-medium text-foreground">
                            {plan.maxApps === -1 ? <InfinityIcon className="size-4 shrink-0" /> : null}
                            {formatLimit(plan.maxApps)}
                        </p>
                    </div>
                    <div className="min-w-0">
                        <p className="text-muted-foreground">DBs</p>
                        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1 break-words font-medium text-foreground">
                            {plan.maxDatabases === -1 ? <InfinityIcon className="size-4 shrink-0" /> : null}
                            {formatLimit(plan.maxDatabases)}
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Included</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                        {enabledFeatures.map((feature) => (
                            <li key={feature} className="flex items-start gap-2">
                                <Check className="mt-0.5 size-4 shrink-0 text-chart-5" />
                                <span className="min-w-0 break-words leading-5">{featureLabel(String(feature))}</span>
                            </li>
                        ))}
                        <li className="flex items-start gap-2">
                            <Check className="mt-0.5 size-4 shrink-0 text-chart-5" />
                            <span className="min-w-0 break-words leading-5">{monitoringTier === "extended" ? "Extended monitoring" : "Basic monitoring"}</span>
                        </li>
                    </ul>
                </div>
            </CardContent>

            <CardFooter className="px-4 sm:px-6">
                <Button
                    type="button"
                    className="w-full whitespace-normal"
                    variant={isCurrent ? "outline" : featured ? "default" : "secondary"}
                    disabled={disabled}
                    onClick={onSelect}
                >
                    {ctaLabel}
                </Button>
            </CardFooter>
        </Card>
    );
}
