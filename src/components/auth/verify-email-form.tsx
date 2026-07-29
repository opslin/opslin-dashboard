"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, LogOut, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { canShowDevOtp } from "@/lib/auth-redirect";

type VerifyEmailFormProps = {
    onVerified: () => Promise<unknown> | unknown;
    onLogout?: () => Promise<unknown> | unknown;
    showLogout?: boolean;
    className?: string;
};

const DEV_OTP_STORAGE_KEY = "opslin.devEmailOtp";
const RESEND_COOLDOWN_SECONDS = 30;

function normalizeOtp(value: string) {
    return value.replace(/\D/g, "").slice(0, 6);
}

export function VerifyEmailForm({
    onVerified,
    onLogout,
    showLogout = false,
    className,
}: VerifyEmailFormProps) {
    const [code, setCode] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [devOtp, setDevOtp] = useState<string | null>(null);
    const [resendCooldown, setResendCooldown] = useState(0);

    useEffect(() => {
        if (!canShowDevOtp()) {
            return;
        }

        const storedDevOtp = sessionStorage.getItem(DEV_OTP_STORAGE_KEY);
        if (!storedDevOtp) {
            return;
        }

        sessionStorage.removeItem(DEV_OTP_STORAGE_KEY);
        const normalized = normalizeOtp(storedDevOtp);
        setDevOtp(normalized);
        setCode(normalized);
    }, []);

    useEffect(() => {
        if (resendCooldown <= 0) {
            return;
        }

        const timer = window.setInterval(() => {
            setResendCooldown((current) => Math.max(0, current - 1));
        }, 1000);

        return () => window.clearInterval(timer);
    }, [resendCooldown]);

    const verifyMutation = useMutation({
        mutationFn: () => api.verifyEmail({ code }),
        onSuccess: async () => {
            setErrorMessage(null);
            setSuccessMessage("Email verified successfully.");
            setDevOtp(null);
            setCode("");
            toast.success("Email verified successfully.");
            await onVerified();
        },
        onError: () => {
            setSuccessMessage(null);
            setErrorMessage("Invalid or expired verification code.");
            toast.error("Invalid or expired verification code.");
        },
    });

    const resendMutation = useMutation({
        mutationFn: () => api.resendVerification(),
        onSuccess: async (result) => {
            setErrorMessage(null);
            setSuccessMessage("Verification code sent.");
            setResendCooldown(RESEND_COOLDOWN_SECONDS);

            if (result.emailVerified) {
                setSuccessMessage("Email verified successfully.");
                await onVerified();
                return;
            }

            if (canShowDevOtp() && result.devOtp) {
                const normalized = normalizeOtp(result.devOtp);
                setDevOtp(normalized);
                setCode(normalized);
            }

            toast.success("Verification code sent.");
        },
        onError: (error) => {
            setSuccessMessage(null);
            setErrorMessage(error instanceof Error ? error.message : "Unable to resend verification code.");
            toast.error(error instanceof Error ? error.message : "Unable to resend verification code.");
        },
    });

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (code.length !== 6 || verifyMutation.isPending) {
            return;
        }
        verifyMutation.mutate();
    };

    return (
        <form onSubmit={handleSubmit} className={className ?? "space-y-4"}>
            <div className="space-y-2">
                <Label htmlFor="emailVerificationCode">6-digit code</Label>
                <Input
                    id="emailVerificationCode"
                    data-testid="verify-email-code-input"
                    value={code}
                    onChange={(event) => setCode(normalizeOtp(event.target.value))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="123456"
                    aria-invalid={Boolean(errorMessage)}
                />
                {canShowDevOtp() && devOtp ? (
                    <p
                        id="devEmailVerificationCode"
                        className="text-sm font-medium text-warning-text"
                    >
                        Dev code: {devOtp}
                    </p>
                ) : null}
            </div>

            {errorMessage ? (
                <Alert variant="destructive" data-testid="verify-email-error">
                    <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
            ) : null}

            {successMessage ? (
                <Alert className="border-success/30 bg-success-muted text-success-text" data-testid="verify-email-success">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription className="text-success-text">
                        {successMessage}
                    </AlertDescription>
                </Alert>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
                <Button
                    type="submit"
                    disabled={verifyMutation.isPending || code.length !== 6}
                    data-testid="verify-email-button"
                >
                    {verifyMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <MailCheck className="mr-2 h-4 w-4" />
                    )}
                    Verify email
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => resendMutation.mutate()}
                    disabled={resendMutation.isPending || resendCooldown > 0}
                    data-testid="resend-verification-button"
                >
                    {resendMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="mr-2 h-4 w-4" />
                    )}
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                </Button>
            </div>

            {showLogout && onLogout ? (
                <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => void onLogout()}
                    data-testid="verify-email-logout"
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                </Button>
            ) : null}
        </form>
    );
}
