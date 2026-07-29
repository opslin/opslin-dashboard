"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { ContactSalesDialog } from "@/components/billing/contact-sales";
import {
    PlanActivationResultDialog,
    type PlanActivationResult,
} from "@/components/billing/plan-activation-result-dialog";
import { RazorpayCheckout } from "@/components/billing/razorpay-checkout";
import { useAuth } from "@/hooks/use-auth";
import { invalidatePlanCache } from "@/hooks/usePlan";
import { PlanCard } from "@/components/pricing/plan-card";
import { UsageMeters } from "@/components/pricing/usage-meters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type BillingTaxBreakdown, type PlanRecord } from "@/lib/api";

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

function formatAmountLabel(plan: PlanRecord, invoice?: BillingTaxBreakdown | null) {
    if (plan.slug === "starter") {
        return "Free for 6 months";
    }

    const amount = invoice?.totalAmount ?? plan.priceWithGst;
    return `₹${amount.toLocaleString("en-IN")}/month`;
}

function paidRenewalDate(subscription: {
    currentPeriodEnd?: string | null;
    endsAt?: string | null;
    trialEnd?: string | null;
} | null | undefined) {
    return subscription?.currentPeriodEnd ?? subscription?.endsAt ?? subscription?.trialEnd ?? null;
}

export function PricingPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { loading, isAuthenticated } = useAuth();
    const [feedback, setFeedback] = useState<string | null>(null);
    const [activationResult, setActivationResult] = useState<PlanActivationResult | null>(null);
    const [enterpriseOpen, setEnterpriseOpen] = useState(false);

    const { data: plansData } = useQuery({
        queryKey: ["plans", "public"],
        queryFn: () => api.getPlans(),
    });
    const { data: currentPlan } = useQuery({
        queryKey: ["plans", "current"],
        queryFn: () => api.getCurrentPlan(),
        enabled: !loading && isAuthenticated,
    });
    const { data: usageData } = useQuery({
        queryKey: ["plans", "usage"],
        queryFn: () => api.getPlanUsage(),
        enabled: !loading && isAuthenticated,
    });

    const plans = useMemo(
        () => [...(plansData?.plans || []), ENTERPRISE_CARD].sort((left, right) => left.sortOrder - right.sortOrder),
        [plansData?.plans]
    );

    const selectMutation = useMutation({
        mutationFn: (slug: "free" | "starter") => api.selectPlan({ slug }),
        onSuccess: async (result, slug) => {
            invalidatePlanCache();
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["plans"] }),
                queryClient.invalidateQueries({ queryKey: ["orgs", "current"] }),
            ]);
            const selectedPlan = plans.find((plan) => plan.slug === slug);

            if (slug === "starter") {
                setFeedback(null);
                setActivationResult({
                    type: "success",
                    planSlug: "starter",
                    planName: selectedPlan?.name || "Starter",
                    title: "Congratulations!",
                    message: "Your 6-month Starter trial is active.",
                    trialEndsOn: result.subscription?.trialEnd ?? result.subscription?.currentPeriodEnd ?? null,
                    amountLabel: "Free for 6 months",
                });
                return;
            }

            setActivationResult(null);
            setFeedback(result.message || "Plan updated.");
        },
        onError: (_error, slug) => {
            if (slug === "starter") {
                setFeedback(null);
                setActivationResult({
                    type: "error",
                    planSlug: "starter",
                    planName: "Starter",
                    title: "Starter trial could not be activated",
                    message: "Please try again. If the problem continues, contact support.",
                });
                return;
            }

            setFeedback("Plan could not be updated.");
        },
    });

    return (
        <div data-testid="pricing-page" className="dashboard-page">
            {currentPlan?.pendingPlan ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Pending upgrade request</CardTitle>
                        <CardDescription>
                            {currentPlan.pendingPlan.name} was selected and is waiting for payment confirmation.
                        </CardDescription>
                    </CardHeader>
                </Card>
            ) : null}

            {feedback ? (
                <Card className="border-chart-5/30 bg-chart-5/10">
                    <CardContent className="flex items-start gap-3 px-4 py-4 text-sm leading-6 text-foreground sm:px-5">
                        <CheckCircle2 className="mt-1 size-4 shrink-0 text-chart-5" />
                        <span className="min-w-0 break-words">{feedback}</span>
                    </CardContent>
                </Card>
            ) : null}

            <div data-testid="pricing-plan-grid" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                {plans.map((plan) => {
                    const isCurrent = currentPlan?.plan.slug === plan.slug;
                    const ctaLabel = isCurrent
                        ? "Current"
                        : !isAuthenticated
                            ? "Create account"
                            : plan.slug === "starter"
                                ? "Start 6-month trial"
                                : plan.slug === "enterprise"
                                    ? "Contact sales"
                                    : plan.slug === "free"
                                        ? "Switch to Free"
                                        : "Subscribe";

                    const card = (onSelect: () => void, isOpening = false) => (
                        <PlanCard
                            plan={plan}
                            isCurrent={isCurrent}
                            ctaLabel={isOpening ? "Opening checkout" : ctaLabel}
                            featured={plan.slug === "starter" || plan.slug === "pro"}
                            disabled={isCurrent || selectMutation.isPending || isOpening}
                            onSelect={onSelect}
                        />
                    );

                    if (plan.slug === "pro" || plan.slug === "business") {
                        return (
                            <RazorpayCheckout
                                key={plan.slug}
                                plan={plan}
                                onError={(_message, details) => {
                                    setFeedback(null);
                                    setActivationResult({
                                        type: "error",
                                        planSlug: plan.slug,
                                        planName: plan.name,
                                        title: "Payment was not completed",
                                        message: "Your plan was not changed. Please try again, or contact support if money was debited.",
                                        paymentId: details?.paymentId ?? null,
                                    });
                                }}
                                onSuccess={async (checkout) => {
                                    invalidatePlanCache();
                                    await Promise.all([
                                        queryClient.invalidateQueries({ queryKey: ["plans"] }),
                                        queryClient.invalidateQueries({ queryKey: ["orgs", "current"] }),
                                    ]);
                                    setFeedback(null);
                                    setActivationResult({
                                        type: "success",
                                        planSlug: plan.slug,
                                        planName: plan.name,
                                        title: "Congratulations!",
                                        message: `Your ${plan.name} subscription is active.`,
                                        subscriptionId: checkout.subscription.razorpaySubId
                                            || checkout.subscription.id
                                            || checkout.subscriptionId
                                            || "Available after confirmation",
                                        renewsOn: paidRenewalDate(checkout.subscription),
                                        amountLabel: formatAmountLabel(plan, checkout.invoice),
                                    });
                                }}
                            >
                                {({ openCheckout, isOpening }) => card(() => {
                                    setFeedback(null);
                                    if (!isAuthenticated) {
                                        router.push("/register");
                                        return;
                                    }
                                    openCheckout();
                                }, isOpening)}
                            </RazorpayCheckout>
                        );
                    }

                    return (
                        <div key={plan.slug}>
                            {card(() => {
                                setFeedback(null);
                                if (!isAuthenticated) {
                                    router.push("/register");
                                    return;
                                }
                                if (plan.slug === "enterprise") {
                                    setEnterpriseOpen(true);
                                    return;
                                }
                                if (plan.slug === "free" || plan.slug === "starter") {
                                    selectMutation.mutate(plan.slug);
                                }
                            })}
                        </div>
                    );
                })}
            </div>

            {usageData ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Live usage</CardTitle>
                        <CardDescription>Quota checks are real-time, not cached, so creation blocks reflect the current organization state.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UsageMeters {...usageData} />
                    </CardContent>
                </Card>
            ) : null}

            <ContactSalesDialog
                open={enterpriseOpen}
                onOpenChange={setEnterpriseOpen}
                onSuccess={setFeedback}
            />
            <PlanActivationResultDialog
                result={activationResult}
                onOpenChange={(open) => {
                    if (!open) {
                        setActivationResult(null);
                    }
                }}
            />
        </div>
    );
}
