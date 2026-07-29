"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, RotateCcw, Settings } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PlanActivationResult =
    | {
        type: "success";
        planSlug: "starter" | "pro" | "business" | "free" | string;
        planName: string;
        title?: string;
        message?: string;
        subscriptionId?: string | null;
        renewsOn?: string | null;
        trialEndsOn?: string | null;
        amountLabel?: string | null;
    }
    | {
        type: "error";
        planSlug?: string;
        planName?: string;
        title?: string;
        message: string;
        paymentId?: string | null;
    };

const DEFAULT_CONFIRMATION_FALLBACK = "Available after confirmation";
const STARTER_TRIAL_FALLBACK = "Available after activation";
const PAID_RENEWAL_FALLBACK = "Available after Razorpay confirms the subscription cycle";

type DetailRow = {
    label: string;
    value: string;
    mono?: boolean;
};

function isStarterSuccess(result: PlanActivationResult | null) {
    return result?.type === "success" && result.planSlug === "starter";
}

function isPaidSuccess(result: PlanActivationResult | null) {
    return result?.type === "success" && (result.planSlug === "pro" || result.planSlug === "business");
}

function formatDate(value?: string | null, fallback = DEFAULT_CONFIRMATION_FALLBACK) {
    if (!value) {
        return fallback;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return fallback;
    }

    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
}

function detailRows(result: PlanActivationResult): DetailRow[] {
    if (result.type === "error") {
        return result.paymentId
            ? [{ label: "Payment ID", value: result.paymentId, mono: true }]
            : [];
    }

    const rows: DetailRow[] = [
        { label: "Plan", value: result.planName },
    ];

    if (isStarterSuccess(result)) {
        rows.push({
            label: "Trial ends on",
            value: formatDate(result.trialEndsOn, STARTER_TRIAL_FALLBACK),
        });
    } else if (isPaidSuccess(result)) {
        rows.push(
            {
                label: "Subscription ID",
                value: result.subscriptionId || "Available after confirmation",
                mono: true,
            },
            {
                label: "Renews on",
                value: formatDate(result.renewsOn, PAID_RENEWAL_FALLBACK),
            }
        );
    } else if (result.subscriptionId) {
        rows.push({
            label: "Subscription ID",
            value: result.subscriptionId,
            mono: true,
        });
    }

    if (result.amountLabel) {
        rows.push({ label: "Amount", value: result.amountLabel });
    }

    return rows;
}

function resultCopy(result: PlanActivationResult) {
    if (result.type === "error") {
        return {
            title: result.title || "Plan activation failed",
            message: result.message,
        };
    }

    if (result.title || result.message) {
        return {
            title: result.title || "Congratulations!",
            message: result.message || `Your ${result.planName} plan is active.`,
        };
    }

    if (result.planSlug === "starter") {
        return {
            title: "Congratulations!",
            message: "Your 6-month Starter trial is active.",
        };
    }

    return {
        title: "Congratulations!",
        message: `Your ${result.planName} subscription is active.`,
    };
}

export function PlanActivationResultDialog({
    result,
    onOpenChange,
}: {
    result: PlanActivationResult | null;
    onOpenChange: (open: boolean) => void;
}) {
    const copy = result ? resultCopy(result) : null;
    const rows = result ? detailRows(result) : [];
    const isSuccess = result?.type === "success";
    const settingsLabel = result && isStarterSuccess(result) ? "View Plan Settings" : "View Billing";

    return (
        <Dialog open={Boolean(result)} onOpenChange={onOpenChange}>
            <DialogContent
                data-testid="plan-activation-result-dialog"
                className="w-[calc(100vw-1rem)] max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6"
            >
                {result && copy ? (
                    <>
                        <DialogHeader className="items-center gap-3 pr-7 text-center sm:items-start sm:text-left">
                            <div
                                className={cn(
                                    "flex size-12 items-center justify-center rounded-full border",
                                    isSuccess
                                        ? "border-chart-5/30 bg-chart-5/10 text-chart-5"
                                        : "border-destructive/30 bg-destructive/10 text-destructive"
                                )}
                                aria-hidden="true"
                            >
                                {isSuccess ? <CheckCircle2 className="size-6" /> : <AlertTriangle className="size-6" />}
                            </div>
                            <div className="min-w-0 space-y-2">
                                <DialogTitle className="break-words text-2xl leading-tight">{copy.title}</DialogTitle>
                                <DialogDescription className="break-words text-base leading-6">
                                    {copy.message}
                                </DialogDescription>
                            </div>
                        </DialogHeader>

                        {rows.length > 0 ? (
                            <Card className="border-border/70 bg-secondary/30 shadow-none">
                                <CardContent className="p-4">
                                    <dl className="space-y-3">
                                        {rows.map((row) => (
                                            <div key={row.label} className="grid min-w-0 gap-1 text-sm sm:grid-cols-[9rem_1fr] sm:gap-4">
                                                <dt className="text-muted-foreground">{row.label}</dt>
                                                <dd
                                                    className={cn(
                                                        "min-w-0 break-words font-medium text-foreground",
                                                        row.mono ? "break-all font-mono text-xs leading-5" : "leading-5"
                                                    )}
                                                >
                                                    {row.value}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </CardContent>
                            </Card>
                        ) : null}

                        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            {isSuccess ? (
                                <>
                                    <Button asChild variant="outline" className="w-full sm:w-auto">
                                        <Link href="/settings">
                                            <Settings className="size-4" />
                                            {settingsLabel}
                                        </Link>
                                    </Button>
                                    <Button asChild className="w-full sm:w-auto">
                                        <Link href="/overview">
                                            Go to Dashboard
                                            <ArrowRight className="size-4" />
                                        </Link>
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button asChild variant="outline" className="w-full sm:w-auto">
                                        <Link href="/pricing" onClick={() => onOpenChange(false)}>
                                            View Plans
                                            <ArrowRight className="size-4" />
                                        </Link>
                                    </Button>
                                    <Button type="button" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                                        <RotateCcw className="size-4" />
                                        Try Again
                                    </Button>
                                </>
                            )}
                        </DialogFooter>
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
