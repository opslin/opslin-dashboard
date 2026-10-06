"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ApiRequestError, api, type MediaAssetQuery } from "@/lib/api";
import { averageColorCss } from "@/lib/media-sdk/thumbhash";

export const LIBRARY_KEY = ["media", "library"] as const;

export const SORTS = {
    newest: { label: "Newest", sort: "created", order: "desc" },
    oldest: { label: "Oldest", sort: "created", order: "asc" },
    "name-asc": { label: "Name A to Z", sort: "name", order: "asc" },
    "name-desc": { label: "Name Z to A", sort: "name", order: "desc" },
    largest: { label: "Largest", sort: "bytes", order: "desc" },
    smallest: { label: "Smallest", sort: "bytes", order: "asc" },
} as const;

export type SortKey = keyof typeof SORTS;

export type LibraryFilter = { folder: string; search: string; sort: SortKey };

/** What to ask for: searching looks everywhere, browsing looks at one folder. */
export function toQuery(filter: LibraryFilter): MediaAssetQuery {
    const { sort, order } = SORTS[filter.sort];
    const search = filter.search.trim();
    return search ? { q: search, sort, order, limit: 50 } : { folder: filter.folder, sort, order, limit: 50 };
}

export function useLibraryAssets(filter: LibraryFilter, enabled = true) {
    return useInfiniteQuery({
        queryKey: [...LIBRARY_KEY, "assets", filter],
        queryFn: ({ pageParam }) => api.listMediaAssets({ ...toQuery(filter), cursor: pageParam }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        enabled,
        retry: false,
        staleTime: 10_000,
    });
}

export function useLibraryFolders(parent: string, enabled = true) {
    return useQuery({
        queryKey: [...LIBRARY_KEY, "folders", parent],
        queryFn: () => api.listMediaFolders(parent),
        enabled,
        retry: false,
        staleTime: 10_000,
    });
}

/** The plain sentence for a failed library call. */
export function libraryErrorText(error: unknown): string {
    if (error instanceof ApiRequestError && error.message) return error.message;
    return "Something went wrong. Try again.";
}

export function libraryErrorCode(error: unknown): string | null {
    if (!(error instanceof ApiRequestError)) return null;
    const code = (error.details as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
}

/** A colour box to show while an image loads, from the stored placeholder. */
export function placeholderColor(thumbhash: string | null): string | undefined {
    if (!thumbhash) return undefined;
    try {
        return averageColorCss(Uint8Array.from(atob(thumbhash), (c) => c.charCodeAt(0)));
    } catch {
        return undefined;
    }
}

/** The best small copy for a thumbnail. */
export function thumbSrc(asset: { urls: { master: string; variants: Record<string, string> } | null; widths: number[] }): string | null {
    if (!asset.urls) return null;
    return asset.urls.variants["320"] ?? asset.urls.master;
}

export function previewSrc(asset: { urls: { master: string; variants: Record<string, string> } | null }): string | null {
    if (!asset.urls) return null;
    return asset.urls.variants["1080"] ?? asset.urls.master;
}
