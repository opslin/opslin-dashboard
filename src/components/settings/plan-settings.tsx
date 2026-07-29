"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, CreditCard, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UsageMeters } from "@/components/pricing/usage-meters";
import { api } from "@/lib/api";

export function PlanSettings() {
    const { data: currentPlan } = useQuery({
        queryKey: ["plans", "current"],
        queryFn: () => api.getCurrentPlan(),
    });

    const { data: usageData } = useQuery({
        queryKey: ["plans", "usage"],
        queryFn: () => api.getPlanUsage(),
    });

    if (!currentPlan || !usageData) {
        return null;
    }

    return (
        <Card data-testid="plan-settings" className="overflow-hidden border-border/80 shadow-sm">
            <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <CreditCard className="size-5" />
                        </div>
                        <div>
                            <CardTitle>Plan and usage</CardTitle>
                            <CardDescription>Current tier, billing state, and live quota consumption.</CardDescription>
                        </div>
                    </div>
                    {/* Default variant (solid bg-primary/text-primary-foreground), not
                        outline+translucent bg-primary/N text-primary: axe measured that
                        pairing failing AA at both /10 (4.38:1) and /15 (4.09:1) — tuning
                        opacity by trial and error is fragile; default is already AA-verified. */}
                    <Badge>Current plan: {currentPlan.plan.name}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                        <div className="flex items-center gap-2">
                            <CreditCard className="size-4 text-primary" />
                            <p className="text-sm font-medium text-foreground">Billing</p>
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-foreground">
                            ₹{currentPlan.plan.priceWithGst.toLocaleString("en-IN")}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {currentPlan.plan.slug === "free" ? "No charge" : `₹${currentPlan.plan.priceMonthly.toLocaleString("en-IN")} base + GST`}
                        </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                        <div className="flex items-center gap-2">
                            <Sparkles className="size-4 text-primary" />
                            <p className="text-sm font-medium text-foreground">Subscription</p>
                        </div>
                        <p className="mt-3 text-2xl font-semibold capitalize text-foreground">
                            {currentPlan.subscription.status}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {currentPlan.pendingPlan ? `Pending ${currentPlan.pendingPlan.name} payment` : "No pending change"}
                        </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="size-4 text-primary" />
                            <p className="text-sm font-medium text-foreground">Trial</p>
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-foreground">
                            {currentPlan.trial?.daysRemaining ?? "—"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {currentPlan.trial?.endsAt ? `Ends ${new Date(currentPlan.trial.endsAt).toLocaleDateString()}` : "No active trial"}
                        </p>
                    </div>
                </div>

                <UsageMeters {...usageData} />

                <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-foreground">Need more capacity?</p>
                        <p className="text-sm text-muted-foreground">Review pricing tiers before changing limits.</p>
                    </div>
                    <Button asChild className="w-full sm:w-fit">
                        <Link href="/pricing">
                            Open pricing
                            <ArrowRight className="size-4" />
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
