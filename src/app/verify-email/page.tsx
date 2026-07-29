"use client";

import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { AuthCard } from "@/components/auth/auth-card";
import { useAuth } from "@/hooks/use-auth";
import { getPostVerificationRedirect } from "@/lib/auth-redirect";

export default function VerifyEmailPage() {
    const router = useRouter();
    const { user, loading, logout, refetch } = useAuth();
    const [verificationComplete, setVerificationComplete] = useState(false);

    useEffect(() => {
        if (loading) {
            return;
        }

        if (!user) {
            router.push("/login?next=/verify-email");
            return;
        }

        if (user.emailVerified && !verificationComplete) {
            router.push("/dashboard");
        }
    }, [loading, router, user, verificationComplete]);

    if (loading || !user || user.emailVerified) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="size-9 animate-spin rounded-full border-4 border-border border-t-primary" />
            </div>
        );
    }

    return (
        <AuthCard
            title="Verify your email"
            description="We sent a 6-digit code to your email."
            eyebrow={
                <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-success/30 bg-success-muted px-3 py-1 text-xs font-medium text-success-text">
                    <MailCheck className="h-3.5 w-3.5" />
                    Email verification
                </div>
            }
        >
            <VerifyEmailForm
                showLogout
                onLogout={logout}
                onVerified={async () => {
                    setVerificationComplete(true);
                    await refetch();
                    window.setTimeout(() => {
                        router.push(getPostVerificationRedirect());
                    }, 600);
                }}
            />
        </AuthCard>
    );
}
