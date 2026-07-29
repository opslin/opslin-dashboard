"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
    api,
    type BillingCheckoutResponse,
    type BillingSuccessResponse,
    type BillingTaxBreakdown,
    type PlanRecord,
} from "@/lib/api";
import { readCssVar } from "@/lib/design-system";

type RazorpayHandlerResponse = {
    razorpay_payment_id?: string;
    razorpay_subscription_id?: string;
    razorpay_signature?: string;
};

type RazorpayPaymentFailedResponse = {
    error?: {
        description?: string;
        reason?: string;
        metadata?: {
            payment_id?: string;
        };
    };
};

type RazorpayOptions = {
    key: string;
    name: string;
    description: string;
    subscription_id: string;
    amount: number;
    currency: string;
    notes: Record<string, string>;
    handler: (response: RazorpayHandlerResponse) => void | Promise<void>;
    modal?: {
        ondismiss?: () => void;
    };
    theme?: {
        color?: string;
    };
};

export type RazorpayCheckoutSuccess = BillingCheckoutResponse & {
    confirmation: BillingSuccessResponse;
    paymentId: string;
    subscription: BillingSuccessResponse["subscription"];
};

export type RazorpayCheckoutErrorDetails = {
    paymentId?: string | null;
};

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayOptions) => {
            open: () => void;
            on?: (event: "payment.failed", handler: (response: RazorpayPaymentFailedResponse) => void) => void;
        };
    }
}

let scriptPromise: Promise<void> | null = null;

function isPaidPlan(slug: string): slug is "pro" | "business" {
    return slug === "pro" || slug === "business";
}

function buildFallbackInvoice(plan: PlanRecord): BillingTaxBreakdown {
    const gstAmount = Math.max(plan.priceWithGst - plan.priceMonthly, 0);

    return {
        baseAmount: plan.priceMonthly,
        gstAmount,
        gstPercent: plan.gstPercent,
        totalAmount: plan.priceWithGst,
        currency: plan.currency,
    };
}

function requireCheckoutSignature(response: RazorpayHandlerResponse) {
    if (!response.razorpay_payment_id || !response.razorpay_subscription_id || !response.razorpay_signature) {
        throw new Error("Razorpay payment confirmation was incomplete. Please retry checkout.");
    }

    return {
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_subscription_id: response.razorpay_subscription_id,
        razorpay_signature: response.razorpay_signature,
    };
}

function getCheckoutCreationError(value: unknown) {
    if (!value || typeof value !== "object") {
        return null;
    }
    const error = (value as Record<string, unknown>).error;
    if (!error || typeof error !== "object") {
        return null;
    }
    const description = (error as Record<string, unknown>).description;
    return typeof description === "string" && description.trim() ? description : null;
}

function getPaymentFailureMessage(response: RazorpayPaymentFailedResponse) {
    return response.error?.description || response.error?.reason || "Payment was not completed.";
}

function requireCheckoutConfig(checkout: unknown): BillingCheckoutResponse {
    const record = checkout as Partial<BillingCheckoutResponse>;
    if (record.keyId && record.subscriptionId) {
        return record as BillingCheckoutResponse;
    }

    throw new Error(getCheckoutCreationError(checkout) || "Payment checkout could not be created. Please verify Razorpay key and plan configuration.");
}

function loadRazorpayScript() {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Checkout is only available in the browser"));
    }
    if (window.Razorpay) {
        return Promise.resolve();
    }
    if (scriptPromise) {
        return scriptPromise;
    }

    scriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Unable to load Razorpay checkout"));
        document.body.appendChild(script);
    });

    return scriptPromise;
}

export function RazorpayCheckout({
    plan,
    onSuccess,
    onError,
    children,
}: {
    plan: PlanRecord;
    onSuccess?: (checkout: RazorpayCheckoutSuccess) => void;
    onError?: (message: string, details?: RazorpayCheckoutErrorDetails) => void;
    children: (state: {
        openCheckout: () => void;
        isOpening: boolean;
    }) => ReactNode;
}) {
    const [isOpening, setIsOpening] = useState(false);

    const openCheckout = useCallback(async () => {
        if (!isPaidPlan(plan.slug)) {
            onError?.("Free, Starter, and Enterprise plans do not open Razorpay checkout.");
            return;
        }

        setIsOpening(true);
        try {
            const checkout = requireCheckoutConfig(await api.createBillingCheckout({ planSlug: plan.slug }));
            const invoice = checkout.invoice ?? buildFallbackInvoice(plan);
            const normalizedCheckout: BillingCheckoutResponse = {
                ...checkout,
                amount: checkout.amount ?? invoice.totalAmount,
                currency: checkout.currency ?? invoice.currency,
                invoice,
            };
            await loadRazorpayScript();

            const RazorpayConstructor = window.Razorpay;
            if (!RazorpayConstructor) {
                throw new Error("Razorpay checkout did not initialize");
            }

            let checkoutHandled = false;
            const instance = new RazorpayConstructor({
                key: normalizedCheckout.keyId,
                name: "Opslin",
                description: `${plan.name} subscription`,
                subscription_id: normalizedCheckout.subscriptionId,
                amount: normalizedCheckout.amount,
                currency: normalizedCheckout.currency,
                notes: {
                    planSlug: normalizedCheckout.planSlug,
                    baseAmount: String(invoice.baseAmount),
                    gstAmount: String(invoice.gstAmount),
                    gstPercent: String(invoice.gstPercent),
                    totalAmount: String(invoice.totalAmount),
                },
                handler: async (response) => {
                    checkoutHandled = true;
                    try {
                        const signature = requireCheckoutSignature(response);
                        const success = await api.confirmBillingSuccess(signature);
                        onSuccess?.({
                            ...normalizedCheckout,
                            confirmation: success,
                            paymentId: signature.razorpay_payment_id,
                            subscription: success.subscription,
                            invoice: success.invoice ?? invoice,
                        });
                    } catch (error) {
                        onError?.((error as Error).message, {
                            paymentId: response.razorpay_payment_id ?? null,
                        });
                    } finally {
                        setIsOpening(false);
                    }
                },
                modal: {
                    ondismiss: () => {
                        setIsOpening(false);
                        if (!checkoutHandled) {
                            checkoutHandled = true;
                            onError?.("Payment was not completed.");
                        }
                    },
                },
                theme: {
                    color: readCssVar("--opslin-accent-default", "#15803d"),
                },
            });

            instance.on?.("payment.failed", (response) => {
                checkoutHandled = true;
                setIsOpening(false);
                onError?.(getPaymentFailureMessage(response), {
                    paymentId: response.error?.metadata?.payment_id ?? null,
                });
            });

            instance.open();
        } catch (error) {
            onError?.((error as Error).message);
        } finally {
            setIsOpening(false);
        }
    }, [onError, onSuccess, plan]);

    return children({ openCheckout, isOpening });
}
