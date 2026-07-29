"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { LegacyDashboardShell } from "@/components/layout/legacy-dashboard-shell";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { TrialBadge } from "@/components/pricing/trial-badge";
import { TrialBanner } from "@/components/pricing/trial-banner";
import { api } from "@/lib/api";
import { getVerifyEmailRedirectTarget } from "@/lib/auth-redirect";
import { shouldBypassEmailVerification, shouldBypassOnboarding } from "@/lib/onboarding-routes";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, loading, isAuthenticated, logout } = useAuth();
    const isPublicPricingRoute = pathname === "/pricing";
    const bypassEmailVerification = shouldBypassEmailVerification(pathname);
    const requiresEmailVerification = Boolean(
        isAuthenticated &&
        user?.emailVerified === false &&
        !bypassEmailVerification
    );
    const { data: servers = [], isLoading: serversLoading } = useQuery({
        queryKey: ["servers"],
        queryFn: () => api.getServers(),
        enabled: Boolean(user && !requiresEmailVerification),
    });
    const { data: currentPlan } = useQuery({
        queryKey: ["plans", "current"],
        queryFn: () => api.getCurrentPlan(),
        enabled: Boolean(user && !requiresEmailVerification),
    });

    useEffect(() => {
        if (!loading && !isAuthenticated && !isPublicPricingRoute) {
            router.push("/login");
            return;
        }

        if (!loading && isAuthenticated && user?.emailVerified === false && !bypassEmailVerification) {
            router.push(getVerifyEmailRedirectTarget(pathname));
        }
    }, [bypassEmailVerification, isAuthenticated, isPublicPricingRoute, loading, pathname, router, user?.emailVerified]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="size-9 animate-spin rounded-full border-4 border-border border-t-primary" />
            </div>
        );
    }

    if (!isAuthenticated) {
        if (isPublicPricingRoute) {
            return <div className="min-h-screen bg-background">{children}</div>;
        }
        return null;
    }

    if (requiresEmailVerification) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="size-9 animate-spin rounded-full border-4 border-border border-t-primary" />
            </div>
        );
    }

    const bypassOnboarding = shouldBypassOnboarding(pathname);
    const showOnboarding = user?.onboardingCompleted === false && !serversLoading && servers.length === 0 && !bypassOnboarding;
    const content = (
        <>
            {!showOnboarding ? <TrialBanner trial={currentPlan?.trial} /> : null}
            {showOnboarding ? <OnboardingWizard /> : children}
        </>
    );

    if (user?.preferences?.newDashboard !== false) {
        return (
            <DashboardShell
                user={user}
                onLogout={logout}
                trialBadge={<TrialBadge trial={currentPlan?.trial} />}
            >
                {content}
            </DashboardShell>
        );
    }

    return <LegacyDashboardShell>{content}</LegacyDashboardShell>;
}
