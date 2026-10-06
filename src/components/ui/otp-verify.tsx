"use client";

import { useEffect, useRef } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { CheckCircle2, Loader2, LogOut } from "lucide-react";
import { ShowcaseShell } from "@/components/ui/showcase-shell";

const OTP_LENGTH = 6;

type OTPVerificationProps = {
    email?: string;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onResend: () => void;
    onLogout?: () => void;
    resendCooldown?: number;
    resendPending?: boolean;
    verifyPending?: boolean;
    errorMessage?: string | null;
    successMessage?: string | null;
    devOtp?: string | null;
};

export function OTPVerification({
    email,
    value,
    onChange,
    onSubmit,
    onResend,
    onLogout,
    resendCooldown = 0,
    resendPending = false,
    verifyPending = false,
    errorMessage,
    successMessage,
    devOtp,
}: OTPVerificationProps) {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const digits = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? "");

    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const focusAt = (index: number) => {
        inputRefs.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))]?.focus();
    };

    const handleChange = (index: number, raw: string) => {
        const incoming = raw.replace(/\D/g, "");
        if (!incoming) {
            const next = digits.slice();
            next[index] = "";
            onChange(next.join(""));
            return;
        }
        const next = digits.slice();
        const chars = incoming.slice(0, OTP_LENGTH - index).split("");
        chars.forEach((char, offset) => {
            next[index + offset] = char;
        });
        onChange(next.join("").slice(0, OTP_LENGTH));
        focusAt(index + chars.length);
    };

    const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Backspace" && !digits[index] && index > 0) {
            focusAt(index - 1);
        } else if (event.key === "ArrowLeft") {
            focusAt(index - 1);
        } else if (event.key === "ArrowRight") {
            focusAt(index + 1);
        } else if (event.key === "Enter" && value.length === OTP_LENGTH) {
            onSubmit();
        }
    };

    const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
        const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
        if (!pasted) return;
        event.preventDefault();
        onChange(pasted);
        focusAt(pasted.length);
    };

    return (
        <ShowcaseShell>
                    <div className="mb-8 text-center">
                        <h1 className="mb-3 text-2xl font-semibold text-slate-900">Verify your email</h1>
                        <p className="text-sm leading-relaxed text-slate-600">
                            We sent a 6-digit code to your email.
                            {email ? (
                                <>
                                    <br />
                                    <span className="font-medium text-slate-900">{email}</span>
                                </>
                            ) : null}
                        </p>
                    </div>

                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (value.length === OTP_LENGTH && !verifyPending) onSubmit();
                        }}
                    >
                        <div
                            role="group"
                            aria-label="6-digit code"
                            className="mb-6 flex justify-center gap-2"
                        >
                            {digits.map((digit, index) => (
                                <input
                                    key={index}
                                    ref={(element) => {
                                        inputRefs.current[index] = element;
                                    }}
                                    data-testid={index === 0 ? "verify-email-code-input" : undefined}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete={index === 0 ? "one-time-code" : "off"}
                                    aria-label={`Digit ${index + 1}`}
                                    aria-invalid={Boolean(errorMessage)}
                                    value={digit}
                                    maxLength={OTP_LENGTH}
                                    onChange={(event) => handleChange(index, event.target.value)}
                                    onKeyDown={(event) => handleKeyDown(index, event)}
                                    onPaste={handlePaste}
                                    onFocus={(event) => event.target.select()}
                                    className="h-12 w-11 rounded-2xl border border-slate-300 bg-white text-center text-xl font-medium text-slate-900 shadow-sm transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 aria-[invalid=true]:border-red-500"
                                />
                            ))}
                        </div>

                        {devOtp ? (
                            <p className="mb-4 text-center text-xs font-medium text-amber-700">
                                Dev code: {devOtp}
                            </p>
                        ) : null}

                        {errorMessage ? (
                            <p
                                role="alert"
                                data-testid="verify-email-error"
                                className="mb-4 text-center text-sm text-red-600"
                            >
                                {errorMessage}
                            </p>
                        ) : null}

                        {successMessage ? (
                            <p
                                data-testid="verify-email-success"
                                className="mb-4 flex items-center justify-center gap-2 text-center text-sm text-emerald-700"
                            >
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                {successMessage}
                            </p>
                        ) : null}

                        <button
                            type="submit"
                            data-testid="verify-email-button"
                            disabled={verifyPending || value.length !== OTP_LENGTH}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {verifyPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                            Verify email
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <span className="text-sm text-slate-500">Didn&apos;t get the code? </span>
                        <button
                            type="button"
                            data-testid="resend-verification-button"
                            onClick={onResend}
                            disabled={resendPending || resendCooldown > 0}
                            className="text-sm font-medium text-blue-600 transition-colors duration-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                        </button>
                    </div>

                    {onLogout ? (
                        <div className="mt-6 text-center">
                            <button
                                type="button"
                                data-testid="verify-email-logout"
                                onClick={onLogout}
                                className="inline-flex items-center gap-2 text-xs text-slate-500 transition-colors hover:text-slate-900"
                            >
                                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                                Logout
                            </button>
                        </div>
                    ) : null}
        </ShowcaseShell>
    );
}
