"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getPostAuthRedirect } from "@/lib/auth-redirect";

type AuthPageGuardProps = {
    children: ReactNode;
    nextPath?: string | null;
};

export function AuthPageGuard({ children, nextPath }: AuthPageGuardProps) {
    const router = useRouter();
    const { user, loading, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && isAuthenticated && user) {
            router.replace(getPostAuthRedirect(user, nextPath));
        }
    }, [loading, isAuthenticated, user, nextPath, router]);

    if (loading || (isAuthenticated && user)) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div
                    aria-label="Checking session"
                    role="status"
                    className="size-9 animate-spin rounded-full border-4 border-border border-t-primary"
                />
            </div>
        );
    }

    return <>{children}</>;
}
