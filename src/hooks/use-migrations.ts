"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError, api } from "@/lib/api";
import type { MigrationListItem, MigrationView } from "@/lib/migration-types";

export type MigrationListResult = { locked: true } | { locked: false; migrations: MigrationListItem[] };

const LIST_KEY = ["migrations"] as const;
const POLL_WHILE_RUNNING_MS = 2000;
const POLL_LIST_MS = 5000;

/** Statuses where the page should keep re-reading because something is happening on a server. */
const RUNNING = new Set(["DISCOVERING", "PROVISIONING", "TRANSFERRING", "VERIFYING", "CUTTING_OVER"]);

export function migrationRefetchInterval(view: MigrationView | undefined): number | false {
    if (view?.copy === "removing") return POLL_WHILE_RUNNING_MS;
    if (!view || view.finished) return false;
    if (RUNNING.has(view.status)) return POLL_WHILE_RUNNING_MS;
    // Just switched: the apps, their temporary addresses and the first check of them appear within a minute.
    if (view.status === "OBSERVING" && (view.apps ?? []).some((a) => a.state === "pending" || (a.state === "ready" && !a.precheck))) return POLL_WHILE_RUNNING_MS;
    // Waiting for the owner. A slow poll still notices a change made from another tab.
    return 10_000;
}

/**
 * Migrations for the current organization. A 403 is not an error: it means migration is not turned on
 * for this organization, so callers render the locked state and the sidebar hides the entry. The page
 * gating is UX only; the API enforces it.
 */
export function useMigrationList() {
    return useQuery<MigrationListResult>({
        queryKey: LIST_KEY,
        queryFn: async () => {
            try {
                const { migrations } = await api.getMigrations();
                return { locked: false, migrations };
            } catch (error) {
                if (error instanceof ApiRequestError && error.status === 403) return { locked: true };
                throw error;
            }
        },
        retry: false,
        staleTime: 15_000,
        refetchInterval: (query) => {
            const data = query.state.data;
            if (!data || data.locked) return false;
            return data.migrations.some((m) => RUNNING.has(m.status)) ? POLL_LIST_MS : false;
        },
    });
}

/** True only once the API says migration is available. Never true while loading. */
export function useMigrationsEnabled() {
    const { data } = useMigrationList();
    return data !== undefined && !data.locked;
}

export function useMigration(id: string) {
    return useQuery<MigrationView>({
        queryKey: ["migration", id],
        queryFn: () => api.getMigration(id),
        retry: false,
        refetchInterval: (query) => migrationRefetchInterval(query.state.data),
    });
}

export function useMigrationDomains(id: string, enabled: boolean) {
    return useQuery({
        queryKey: ["migration", id, "domains"],
        queryFn: () => api.getMigrationDomains(id),
        enabled,
        refetchInterval: enabled ? 15_000 : false,
        retry: false,
    });
}

/** One mutation per owner action; each returns the fresh view, which replaces the cached one at once. */
export function useMigrationActions(id: string) {
    const queryClient = useQueryClient();
    const accept = (view: MigrationView) => {
        queryClient.setQueryData(["migration", id], view);
        void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    };
    const options = { onSuccess: accept };
    return {
        confirm: useMutation({ mutationFn: (data: { planHash: string; acknowledged: string[]; skip?: string[] }) => api.confirmMigrationPlan(id, data), ...options }),
        setSkip: useMutation({ mutationFn: (skip: string[]) => api.updateMigrationOptions(id, { skip }), ...options }),
        rescan: useMutation({ mutationFn: () => api.rescanMigration(id), ...options }),
        retry: useMutation({ mutationFn: () => api.retryMigration(id), ...options }),
        resume: useMutation({ mutationFn: () => api.resumeMigration(id), ...options }),
        cutover: useMutation({ mutationFn: (planHash: string) => api.startMigrationCutover(id, { planHash, confirm: true }), ...options }),
        accept: useMutation({ mutationFn: () => api.acceptMigration(id), ...options }),
        abort: useMutation({ mutationFn: () => api.abortMigration(id), ...options }),
        recover: useMutation({ mutationFn: () => api.recoverMigration(id), ...options }),
        recheck: useMutation({ mutationFn: () => api.recheckMigrationFinal(id), ...options }),
        retryLinks: useMutation({ mutationFn: () => api.retryMigrationLinks(id), ...options }),
        checkLinks: useMutation({ mutationFn: (siteKey?: string) => api.checkMigrationLinks(id, siteKey), ...options }),
        clearCopy: useMutation({ mutationFn: () => api.clearMigrationCopy(id), ...options }),
    };
}

export function useStartMigration() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { sourceServerId: string; targetServerId: string }) => api.startMigration(data),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: LIST_KEY }),
    });
}

/** Reads the new server's recent error messages and explains them. Read-only; nothing is changed on either server. */
export function useDiagnose(id: string) {
    return useMutation({ mutationFn: () => api.diagnoseMigration(id) });
}
