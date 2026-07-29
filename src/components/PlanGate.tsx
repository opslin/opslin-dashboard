"use client";

import React from "react";
import { usePlan } from "../hooks/usePlan";
import { UpgradePrompt } from "./UpgradePrompt";

type PlanGateProps = {
    feature: string;
    children: React.ReactNode;
    fallback?: React.ReactNode;
};

export function PlanGate({ feature, children, fallback }: PlanGateProps) {
    const { can, loading } = usePlan();

    if (loading) return null;

    if (!can(feature)) {
        return fallback ? <>{fallback}</> : <UpgradePrompt feature={feature} />;
    }

    return <>{children}</>;
}
