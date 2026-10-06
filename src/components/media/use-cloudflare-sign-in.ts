"use client";

import { useMutation } from "@tanstack/react-query";
import { ApiRequestError, api } from "@/lib/api";

/** Starts the Cloudflare sign-in: the API returns the consent URL and the browser goes there. */
export function useCloudflareSignIn() {
    const mutation = useMutation({
        mutationFn: () => api.startMediaCloudflareSignIn(),
        onSuccess: ({ authorizeUrl }) => {
            window.location.assign(authorizeUrl);
        },
    });

    const error = mutation.error;
    const line =
        error instanceof ApiRequestError && error.status === 503
            ? "Cloudflare sign-in isn't set up on this server yet."
            : error instanceof ApiRequestError && error.status === 403
              ? "Only owners and admins can connect Cloudflare."
              : error
                ? "Couldn't start the Cloudflare sign-in. Try again."
                : null;

    return { start: () => mutation.mutate(), pending: mutation.isPending, line };
}
