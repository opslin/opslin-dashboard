"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiRequestError, api, type MarketplaceCatalog } from "@/lib/api";

export type MarketplaceQueryResult = { locked: true } | { locked: false; catalog: MarketplaceCatalog };

/**
 * The Marketplace catalog for this organization. A 403 is not an error: it means the feature is not on for this
 * organization, so the page shows the locked state and the sidebar hides the entry. The API enforces the gate.
 */
export function useMarketplace() {
    return useQuery<MarketplaceQueryResult>({
        queryKey: ["marketplace"],
        queryFn: async () => {
            try {
                return { locked: false, catalog: await api.getMarketplace() };
            } catch (error) {
                if (error instanceof ApiRequestError && error.status === 403) return { locked: true };
                throw error;
            }
        },
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
}

export function useMarketplaceEnabled() {
    const { data } = useMarketplace();
    return data?.locked === false;
}
