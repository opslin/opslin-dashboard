"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiRequestError, api, type MediaState } from "@/lib/api";

export type MediaQueryResult = { locked: true } | { locked: false; media: MediaState };

const POLL_WHILE_WORKING_MS = 2000;
const POLL_WHILE_FOLLOWING_MS = 1500;
const FOLLOW_WINDOW_MS = 20_000;
const FOLLOW_KEY = ["media-follow"] as const;

/**
 * Call right after the person starts or retries setup. The API answers at once and runs the work in the
 * background, so the first re-read can still show the old "needs R2" state; keep re-reading for a while
 * so the page shows what happened without a manual reload.
 */
export function followMediaSetup(queryClient: QueryClient, now = Date.now()) {
    queryClient.setQueryData(FOLLOW_KEY, now + FOLLOW_WINDOW_MS);
}

/**
 * How often to re-read Media. While setup is running the page must follow it, so it re-reads every
 * couple of seconds; as soon as setup finishes, fails or waits for the person, it stops polling.
 */
export function mediaRefetchInterval(result: MediaQueryResult | undefined, followUntil = 0, now = Date.now()): number | false {
    if (!result || result.locked || !result.media.configured) {
        return false;
    }
    const { state, steps } = result.media;
    if (state === "PROVISIONING" && now < followUntil) {
        return POLL_WHILE_FOLLOWING_MS;
    }
    if (state !== "PROVISIONING") {
        return false;
    }
    const settled = steps.some((step) => ["NEEDS_INPUT", "FAILED", "WAITING"].includes(step.status));
    const allDone = steps.every((step) => step.status === "DONE");
    return settled || allDone ? false : POLL_WHILE_WORKING_MS;
}

/**
 * Opslin Media state for the current organization. A 403 is not an error here: it means
 * the feature is not enabled for this organization, so callers render the locked state
 * (and the sidebar hides the entry). Dashboard gating is UX only; the API enforces it.
 */
export function useMedia() {
    const queryClient = useQueryClient();
    return useQuery<MediaQueryResult>({
        queryKey: ["media"],
        queryFn: async () => {
            try {
                return { locked: false, media: await api.getMedia() };
            } catch (error) {
                if (error instanceof ApiRequestError && error.status === 403) {
                    return { locked: true };
                }
                throw error;
            }
        },
        staleTime: 5 * 60 * 1000,
        refetchInterval: (query) => mediaRefetchInterval(query.state.data, queryClient.getQueryData<number>(FOLLOW_KEY) ?? 0),
        retry: false,
    });
}

/** True only once the API has confirmed Media is enabled for this organization. */
export function useMediaEnabled() {
    const { data } = useMedia();
    return data?.locked === false;
}
