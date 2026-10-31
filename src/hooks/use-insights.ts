"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";
import type { DeployInsights } from "@/lib/insights-types";

export type InsightsResult = { locked: true } | { locked: false; data: DeployInsights };

/** The organization's own deploy numbers. A 403 means the feature is not switched on for it: shown as a locked state, not an error. */
export function useDeployInsights(rangeDays: number) {
    return useQuery<InsightsResult>({
        queryKey: ["insights", "deploys", rangeDays],
        queryFn: async () => {
            try {
                return { locked: false, data: await api.getDeployInsights(rangeDays) };
            } catch (error) {
                if (error instanceof ApiRequestError && error.status === 403) return { locked: true };
                throw error;
            }
        },
        retry: false,
        staleTime: 30_000,
    });
}

/** True only once the API has confirmed insights for this organization. Never true while loading. */
export function useInsightsEnabled() {
    const { data } = useDeployInsights(30);
    return data !== undefined && !data.locked;
}
