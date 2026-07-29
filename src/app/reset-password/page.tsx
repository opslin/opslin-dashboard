"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import { AuthPageGuard } from "@/components/auth/auth-page-guard";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
    const [token, setToken] = useState<string | null>(null);
    const [tokenResolved, setTokenResolved] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        setToken(new URLSearchParams(window.location.search).get("token"));
        setTokenResolved(true);
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!token) {
            setErrorMessage("Invalid or expired reset link.");
            return;
        }
        if (newPassword.length < 8) {
            setErrorMessage("Password must be at least 8 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setErrorMessage("Passwords do not match.");
            return;
        }

        setLoading(true);
        setErrorMessage(null);

        try {
            await api.resetPassword({ token, newPassword });
            setSuccessMessage("Password reset successfully. You can now log in with your new password.");
            setNewPassword("");
            setConfirmPassword("");
        } catch {
            setSuccessMessage(null);
            setErrorMessage("Invalid or expired reset link.");
        } finally {
            setLoading(false);
        }
    };

    if (!tokenResolved) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="size-9 animate-spin rounded-full border-4 border-border border-t-primary" />
            </div>
        );
    }

    const resetContent = (
        <AuthCard
            title="Set a new password"
            description="Choose a new password for your Opslin account."
            eyebrow={
                <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground">
                    <KeyRound className="h-3.5 w-3.5" />
                    Secure reset
                </div>
            }
        >
            {!token ? (
                <Alert variant="destructive">
                    <AlertDescription>Invalid or expired reset link.</AlertDescription>
                </Alert>
            ) : successMessage ? (
                <Alert className="border-success/30 bg-success-muted text-success-text">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription className="text-success-text">
                        {successMessage}
                    </AlertDescription>
                </Alert>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="newPassword">New password</Label>
                        <Input
                            id="newPassword"
                            type="password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            autoComplete="new-password"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm password</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
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
                        {loading ? "Resetting password..." : "Reset password"}
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
    );

    if (!token) {
        return <AuthPageGuard>{resetContent}</AuthPageGuard>;
    }

    return resetContent;
}
