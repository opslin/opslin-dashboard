"use client";

import { Header } from "@/components/layout/header";
import { PricingPage } from "@/components/pricing/pricing-page";

export default function PricingRoute() {
    return (
        <>
            <Header
                title="Pricing"
                description="Compare free, trial, and paid tiers with GST-inclusive totals and live organization usage."
            />
            <PricingPage />
        </>
    );
}
