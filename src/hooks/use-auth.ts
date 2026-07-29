"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import { clearLegacyToken } from "@/lib/auth";

function isTransientAuthBootstrapError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    return /failed to fetch|networkerror|load failed/i.test(error.message);
}

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const fetchUser = useCallback(async () => {
        try {
            const userData = await api.getMe();
            setUser(userData);
            clearLegacyToken();
        } catch (error) {
            if (!isTransientAuthBootstrapError(error)) {
                clearLegacyToken();
                setUser(null);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const logout = useCallback(async () => {
        await api.logout();
        setUser(null);
        clearLegacyToken();
        router.push("/login");
    }, [router]);

    return {
        user,
        loading,
        isAuthenticated: !!user,
        logout,
        refetch: fetchUser,
    };
}

export function useRequireAuth() {
    const { user, loading, isAuthenticated } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push("/login");
        }
    }, [loading, isAuthenticated, router]);

    return { user, loading };
}
