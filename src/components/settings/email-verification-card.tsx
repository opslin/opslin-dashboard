"use client";

import { CheckCircle2, MailCheck } from "lucide-react";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { User } from "@/lib/api";

export function EmailVerificationCard({
    user,
    onVerified,
}: {
    user: User | null;
    onVerified: () => Promise<unknown> | unknown;
}) {
    const isVerified = Boolean(user?.emailVerified);

    return (
        <Card data-testid="email-verification-card" className="border-border/80 shadow-sm">
            <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <MailCheck className="size-5" />
                        </div>
                        <div>
                            <CardTitle>Email Verification</CardTitle>
                            <CardDescription>
                                Verify your email before creating applications.
                            </CardDescription>
                        </div>
                    </div>
                    <Badge
                        variant="outline"
                        className={isVerified
                            ? "border-success/30 bg-success-muted text-success-text"
                            : "border-warning/30 bg-warning-muted text-warning-text"}
                    >
                        {isVerified ? "Verified" : "Verification required"}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {isVerified ? (
                    <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success-muted px-4 py-3 text-sm text-success-text">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="min-w-0 truncate">{user?.email} is verified.</span>
                    </div>
                ) : (
                    <VerifyEmailForm onVerified={onVerified} />
                )}
            </CardContent>
        </Card>
    );
}
