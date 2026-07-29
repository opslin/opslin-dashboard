"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type FeatureValue = boolean | string | number;

type PlanFeatures = Record<string, Record<string, FeatureValue> | FeatureValue>;

type PlanData = {
    plan: {
        slug: string;
        name: string;
        features: PlanFeatures;
        maxServers: number;
        maxApps: number;
        maxDatabases: number;
    };
    subscription: {
        status: string;
        trialStart: string | null;
        trialEnd: string | null;
        paymentRequired: boolean;
    } | null;
    usage: {
        servers: number;
        apps: number;
        databases: number;
    };
    trial: {
        status: string;
        daysRemaining: number | null;
        isExpired: boolean;
        isInGracePeriod: boolean;
    } | null;
};

let cachedPlanData: PlanData | null = null;
let inFlightRefresh: Promise<PlanData | null> | null = null;

/**
 * Invalidate the module-level plan cache. Call this after plan upgrades/downgrades
 * to ensure PlanGate components pick up the new plan on next render.
 */
export function invalidatePlanCache() {
    cachedPlanData = null;
    inFlightRefresh = null;
}

async function loadCurrentPlan() {
    if (!inFlightRefresh) {
        inFlightRefresh = api.getCurrentPlan()
            .then((response) => {
                const next = response as unknown as PlanData;
                cachedPlanData = next;
                return next;
            })
            .catch(() => cachedPlanData)
            .finally(() => {
                inFlightRefresh = null;
            });
    }

    return inFlightRefresh;
}

/**
 * Map from dotted feature paths (used by PlanGate) to flat feature keys
 * (used in legacy plan data stored in the database).
 * This allows the dashboard to work with both nested and flat feature formats.
 */
const FLAT_FEATURE_FALLBACKS: Record<string, string | string[]> = {
    "server.firewallControls": ["firewallControls", "ssl"],
    "server.terminal": ["terminal", "ssl"],
    "server.nginxConfig": ["nginxConfig", "ssl"],
    "domains.customDomainMode": ["customDomainMode", "ssl"],
    "ssl.customDomain": ["ssl"],
    "deploy.safeDeploy": ["safeDeploy", "gitDeploy"],
    "deploy.githubActionsSetup": ["githubActionsSetup", "gitDeploy"],
    "deploy.ciGate": ["ciGate", "gitDeploy"],
    "deploy.commitDeploy": ["commitDeploy", "gitDeploy"],
    "testing.virtualUsers": ["virtualUsers"],
    "testing.performanceSummary": ["performanceSummary"],
    "testing.customTestCommands": ["customTestCommands"],
    "testing.previewEnvironment": ["previewEnvironment"],
    "alerts.email": ["alerts"],
    "alerts.webhook": ["alerts"],
    "team.rbac": ["rbac"],
    "team.auditLogs": ["auditLog"],
    "team.orgRoles": ["orgRoles", "rbac"],
    "team.sso": ["sso"],
    "backups.manual": ["backups"],
    "backups.scheduled": ["backups"],
    "backups.restore": ["backups"],
    "backups.restoreDrill": ["backups"],
    "logs.logDownload": ["logDownload"],
    "logs.requestAnalytics": ["requestAnalytics"],
    "logs.securityEvents": ["securityEvents"],
    "support.email": ["prioritySupport"],
    "support.priorityEmail": ["prioritySupport"],
    "support.priority": ["prioritySupport"],
    "support.dedicated": ["compliance"],
};

function resolveFeature(features: PlanFeatures, featurePath: string) {
    // First try nested path resolution (new format)
    const parts = featurePath.split(".");
    let current: unknown = features;

    for (const part of parts) {
        if (!current || typeof current !== "object") {
            current = undefined;
            break;
        }
        current = (current as Record<string, unknown>)[part];
    }

    // If nested resolution found a value, return it
    if (current !== undefined) {
        return current;
    }

    // Fallback: check flat feature keys for legacy plan data
    const flatKeys = FLAT_FEATURE_FALLBACKS[featurePath];
    if (flatKeys) {
        const keys = Array.isArray(flatKeys) ? flatKeys : [flatKeys];
        for (const key of keys) {
            const value = (features as Record<string, unknown>)[key];
            if (value !== undefined && value !== null) {
                return value;
            }
        }
    }

    return undefined;
}

export function usePlan() {
    const [data, setData] = useState<PlanData | null>(cachedPlanData);
    const [loading, setLoading] = useState(!cachedPlanData);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const next = await loadCurrentPlan();
            if (next) {
                setData(next);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    /**
     * Check if a feature is available.
     * Supports dotted paths: "deploy.safeDeploy", "server.terminal"
     */
    const can = useCallback((featurePath: string): boolean => {
        if (!data?.plan?.features) return false;

        const current = resolveFeature(data.plan.features, featurePath);
        if (current === undefined || current === null) return false;
        if (typeof current === "boolean") return current;
        if (typeof current === "number") return current > 0 || current === -1;
        if (typeof current === "string") {
            const lower = current.toLowerCase();
            return lower !== "off" && lower !== "none" && lower !== "no" && lower !== "false";
        }
        return false;
    }, [data]);

    const isAtLimit = useCallback((resource: "app" | "server" | "database"): boolean => {
        if (!data) return false;
        const limitMap = {
            app: { used: data.usage.apps, max: data.plan.maxApps },
            server: { used: data.usage.servers, max: data.plan.maxServers },
            database: { used: data.usage.databases, max: data.plan.maxDatabases },
        };
        const { used, max } = limitMap[resource];
        return max !== -1 && used >= max;
    }, [data]);

    return useMemo(() => ({
        plan: data?.plan ?? null,
        subscription: data?.subscription ?? null,
        usage: data?.usage ?? null,
        trial: data?.trial ?? null,
        loading,
        refresh,
        can,
        isAtLimit,
    }), [can, data, isAtLimit, loading, refresh]);
}
