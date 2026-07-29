"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getPostAuthRedirect } from "@/lib/auth-redirect";

export default function RootPage() {
    const router = useRouter();
    const { user, loading, isAuthenticated } = useAuth();

    useEffect(() => {
        if (loading) return;
        router.replace(isAuthenticated && user ? getPostAuthRedirect(user, null) : "/login");
    }, [loading, isAuthenticated, user, router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div
                aria-label="Loading"
                role="status"
                className="size-9 animate-spin rounded-full border-4 border-border border-t-primary"
            />
        </div>
    );
}
