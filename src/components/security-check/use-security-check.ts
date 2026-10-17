"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError, type SecurityCheckScanSummary, type StressTestSummary } from "@/lib/api";

const KEY = ["security-check"] as const;

export function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof ApiRequestError && error.details.message) return error.details.message;
    return error instanceof Error && error.message ? error.message : fallback;
}

/** A check that asked for a stress test which has not been started yet: keep polling until it has. */
export function awaitsStress(scan: Pick<SecurityCheckScanSummary, "status" | "progress"> | null | undefined): boolean {
    return scan?.status === "COMPLETED" && scan.progress?.includeStress === true && !scan.progress.stress;
}

export function isActiveScan(scan: Pick<SecurityCheckScanSummary | StressTestSummary, "status"> | null | undefined): boolean {
    return scan?.status === "QUEUED" || scan?.status === "RUNNING";
}

/** Allowance and the organization's domains. */
export function useSecurityCheckOverview() {
    return useQuery({
        queryKey: [...KEY, "overview"],
        queryFn: () => api.getSecurityCheck(),
        // While any check is running the list follows it; otherwise it stays quiet.
        refetchInterval: (query) => (query.state.data?.targets.some((t) => isActiveScan(t.latest) || isActiveScan(t.latestStress) || awaitsStress(t.latest)) ? 3000 : false),
    });
}

export function useSecurityCheckTarget(id: string | null) {
    return useQuery({
        queryKey: [...KEY, "target", id],
        queryFn: () => api.getSecurityCheckTarget(id as string),
        enabled: Boolean(id),
        refetchInterval: (query) => (isActiveScan(query.state.data?.target.latest) ? 2500 : false),
    });
}

export function useSecurityCheckScan(scanId: string | null | undefined) {
    return useQuery({
        queryKey: [...KEY, "scan", scanId],
        queryFn: () => api.getSecurityCheckScan(scanId as string),
        enabled: Boolean(scanId),
        refetchInterval: (query) => (isActiveScan(query.state.data?.scan) ? 2500 : false),
    });
}

export function useStressTest(id: string | null | undefined) {
    return useQuery({
        queryKey: [...KEY, "stress", id],
        queryFn: () => api.getStressTest(id as string),
        enabled: Boolean(id),
        refetchInterval: (query) => (isActiveScan(query.state.data?.stress) ? 2500 : false),
    });
}

export function useSecurityCheckHistory(targetId: string | null, enabled: boolean) {
    return useQuery({
        queryKey: [...KEY, "history", targetId],
        queryFn: () => api.getSecurityCheckScans(targetId as string),
        enabled: Boolean(targetId) && enabled,
    });
}

export function useSecurityCheckActions() {
    const queryClient = useQueryClient();
    const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
    return {
        addDomain: useMutation({ mutationFn: (hostname: string) => api.addSecurityCheckDomain(hostname), onSuccess: refresh }),
        verify: useMutation({ mutationFn: (id: string) => api.verifySecurityCheckDomain(id), onSuccess: refresh }),
        remove: useMutation({ mutationFn: (id: string) => api.removeSecurityCheckDomain(id), onSuccess: refresh }),
        start: useMutation({ mutationFn: (input: string | { id: string; includeStress?: boolean }) => (typeof input === "string" ? api.startSecurityCheck(input) : api.startSecurityCheck(input.id, input.includeStress)), onSuccess: refresh }),
        startStress: useMutation({ mutationFn: (id: string) => api.startStressTest(id), onSuccess: refresh }),
    };
}
