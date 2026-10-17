"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError, type HostCheckSummary } from "@/lib/api";

const key = (serverId: string) => ["host-check", serverId] as const;

export function isActiveHostCheck(check: Pick<HostCheckSummary, "status"> | null | undefined): boolean {
    return check?.status === "QUEUED" || check?.status === "RUNNING";
}

/** True when the server answered that the check is off for this organization (hide it, do not show an error). */
export function isFeatureOff(error: unknown): boolean {
    return error instanceof ApiRequestError && error.status === 403 && error.details.code === "feature_disabled";
}

/** The latest check, its report and the comparison with the one before. Polls while one is running. */
export function useHostCheck(serverId: string) {
    return useQuery({
        queryKey: [...key(serverId), "latest"],
        queryFn: () => api.getHostCheck(serverId),
        retry: (count, error) => !isFeatureOff(error) && count < 2,
        refetchInterval: (query) => (isActiveHostCheck(query.state.data?.check) ? 3000 : false),
    });
}

export function useHostCheckById(serverId: string, checkId: string | null) {
    return useQuery({
        queryKey: [...key(serverId), "check", checkId],
        queryFn: () => api.getHostCheckById(serverId, checkId as string),
        enabled: Boolean(checkId),
    });
}

export function useHostCheckHistory(serverId: string, enabled: boolean) {
    return useQuery({ queryKey: [...key(serverId), "history"], queryFn: () => api.getHostCheckHistory(serverId), enabled });
}

export function useStartHostCheck(serverId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => api.startHostCheck(serverId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: key(serverId) }),
    });
}
