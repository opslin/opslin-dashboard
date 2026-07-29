"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { AuthPageGuard } from "@/components/auth/auth-page-guard";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const nextPath = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next") || new URLSearchParams(window.location.search).get("redirect")
        : null;

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const nextEmail = email.trim().toLowerCase();

        if (!isValidEmail(nextEmail)) {
            setSuccessMessage(null);
            setErrorMessage("Enter a valid email address.");
            return;
        }

        setLoading(true);
        setErrorMessage(null);

        try {
            const response = await api.forgotPassword({ email: nextEmail });
            setSuccessMessage(response.message);
        } catch (error) {
            setSuccessMessage(null);
            setErrorMessage(error instanceof Error ? error.message : "Unable to send reset link.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthPageGuard nextPath={nextPath}>
        <AuthCard
            title="Forgot password?"
            description="Enter your email and we'll send a reset link if the account exists."
        >
            {successMessage ? (
                <Alert className="border-success/30 bg-success-muted text-success-text">
                    <MailCheck className="h-4 w-4" />
                    <AlertDescription className="text-success-text">
                        <span className="block font-medium">Check your email</span>
                        {successMessage}
                    </AlertDescription>
                </Alert>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="you@example.com"
                            autoComplete="email"
                            aria-invalid={Boolean(errorMessage)}
                        />
                    </div>
                    {errorMessage ? (
                        <p className="text-sm text-destructive">{errorMessage}</p>
                    ) : null}
                    <Button
                        type="submit"
                        className="w-full transition-transform duration-150 active:scale-[0.98]"
                        disabled={loading}
                    >
                        {loading ? "Sending reset link..." : "Send reset link"}
                    </Button>
                </form>
            )}

            <Link
                href="/login"
                className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to login
            </Link>
        </AuthCard>
        </AuthPageGuard>
    );
}
