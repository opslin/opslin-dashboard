"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthPageGuard } from "@/components/auth/auth-page-guard";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { register } from "@/lib/auth";
import { canShowDevOtp, getPostAuthRedirect } from "@/lib/auth-redirect";
import { toast } from "sonner";

export default function RegisterPage() {
    const router = useRouter();
    const [name, setName] = useState("");
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
            const result = await register(email, password, name);
            if (canShowDevOtp() && result.devOtp) {
                sessionStorage.setItem("opslin.devEmailOtp", result.devOtp);
                toast.success(`Account created. Dev verification code: ${result.devOtp}`);
            } else {
                toast.success("Account created. Check your email for the verification code.");
            }
            router.push(getPostAuthRedirect(result.user, nextPath));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthPageGuard nextPath={nextPath}>
        <AuthSplitShell>
            <div className="mb-8">
                <h1 className="text-2xl font-semibold text-foreground">Create your account</h1>
                <p className="mt-1 text-sm text-muted-foreground">Start deploying apps in minutes</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                        id="name"
                        type="text"
                        placeholder="John Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                </div>
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
                    <Label htmlFor="password">Password</Label>
                    <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>
                <Button
                    type="submit"
                    className="w-full transition-transform duration-150 active:scale-[0.98]"
                    disabled={loading}
                >
                    {loading ? "Creating account..." : "Create account"}
                </Button>
            </form>
            <div className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"} className="font-medium text-foreground hover:underline">
                    Sign in
                </Link>
            </div>
        </AuthSplitShell>
        </AuthPageGuard>
    );
}
