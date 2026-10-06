"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
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
        <VerifyEmailForm
            variant="otp"
            email={user.email}
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
    );
}
