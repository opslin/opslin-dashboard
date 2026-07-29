"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthPageGuard } from "@/components/auth/auth-page-guard";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/auth";
import { getPostAuthRedirect } from "@/lib/auth-redirect";
import { toast } from "sonner";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const nextPath = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next") || new URLSearchParams(window.location.search).get("redirect")
        : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const result = await login(email, password);
            router.push(getPostAuthRedirect(result.user, nextPath));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthPageGuard nextPath={nextPath}>
        <AuthSplitShell>
            <div className="mb-8">
                <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
                <p className="mt-1 text-sm text-muted-foreground">Sign in to your Opslin account</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="password">Password</Label>
                        <Link
                            href="/forgot-password"
                            className="text-sm font-medium text-foreground hover:underline"
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <Button
                    type="submit"
                    className="w-full transition-transform duration-150 active:scale-[0.98]"
                    disabled={loading}
                >
                    {loading ? "Signing in..." : "Sign in"}
                </Button>
            </form>
            <div className="mt-6 text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link href={nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : "/register"} className="font-medium text-foreground hover:underline">
                    Create account
                </Link>
            </div>
        </AuthSplitShell>
        </AuthPageGuard>
    );
}
