"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";
import type { DeployRecommendationData, FitAssessmentData } from "@/lib/deploy-route-types";

export type DeployRouteResult = { locked: true } | { locked: false; data: DeployRecommendationData };

/**
 * Asks the API which way a repository should be deployed. A 403 means the feature is not switched on for this
 * organization: the wizard then shows nothing, as before. Cached per repository and branch, because the answer
 * requires cloning the repository.
 */
export function useDeployRoute(input: { gitUrl: string; branch: string; githubInstallationId: string | null }, enabled: boolean) {
    const gitUrl = input.gitUrl.trim();
    return useQuery<DeployRouteResult>({
        queryKey: ["deploy-route", gitUrl, input.branch, input.githubInstallationId],
        queryFn: async () => {
            try {
                return { locked: false, data: await api.getDeployRoute({ gitUrl, branch: input.branch || undefined, githubInstallationId: input.githubInstallationId || undefined }) };
            } catch (error) {
                if (error instanceof ApiRequestError && error.status === 403) return { locked: true };
                throw error;
            }
        },
        enabled: enabled && gitUrl.length > 0,
        retry: false,
        staleTime: 5 * 60_000,
    });
}

/**
 * Is the chosen server big enough for what the front door found? Cheap, so it is asked again whenever the server changes.
 * Any failure (including a server that has not reported yet) simply shows no fit row.
 */
/** The declared memory of each translated Kubernetes service (0 = none declared), so the fit counts what will run. */
export function translatedServiceMemory(recommendation: DeployRecommendationData | null): number[] | undefined {
    const k8s = recommendation?.plan?.kubernetes;
    if (!k8s || k8s.refusals.length > 0) return undefined;
    return k8s.services.filter((s) => !s.oneShot).map((s) => s.memoryMb ?? 0);
}

export function useServerFit(recommendation: DeployRecommendationData | null, serverId: string) {
    return useQuery<FitAssessmentData>({
        queryKey: ["deploy-fit", serverId, recommendation?.resolvedSha ?? null, recommendation?.units.map((u) => `${u.path}:${u.stack}`).join("|") ?? null, recommendation?.composeServices.join(",") ?? null],
        queryFn: () => api.getServerFit({ serverId, units: recommendation!.units, needs: recommendation!.needs, composeServices: recommendation!.composeServices, serviceMemoryMb: translatedServiceMemory(recommendation) }),
        enabled: recommendation !== null && serverId.length > 0,
        retry: false,
        staleTime: 60_000,
    });
}
