"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMedia } from "@/hooks/use-media";
import { api } from "@/lib/api";

/**
 * The Storage connection, with the one-sign-in rule built in: when the organization is already signed in with
 * Cloudflare (it is, as soon as Media is set up) and Storage has not picked an account yet, it uses the account Media
 * already works with. Nobody signs in a second time, and nobody is asked to choose an account that is already known.
 *
 * If that does not work (for example the sign-in has since expired) `autoConnectFailed` is true and the caller falls
 * back to the normal sign-in button.
 */
export function useStorageConnection() {
    const queryClient = useQueryClient();
    const connection = useQuery({ queryKey: ["r2Connection"], queryFn: () => api.getR2Connection() });
    const media = useMedia();
    const project = media.data && !media.data.locked && media.data.media.configured ? media.data.media : null;
    const tried = useRef(false);

    const connect = useMutation({
        mutationFn: () => {
            if (!project) throw new Error("No Cloudflare account to use");
            return api.saveR2Connection({
                signIn: true,
                cloudflareAccountId: project.cloudflareAccountId,
                cloudflareAccountName: project.cloudflareAccountName ?? undefined,
            });
        },
        onSuccess: () => {
            toast.success("Cloudflare connected");
            void queryClient.invalidateQueries({ queryKey: ["r2Connection"] });
        },
    });

    const canAutoConnect = Boolean(connection.data && !connection.data.configured && connection.data.cloudflareSignedIn && project);
    const { mutate } = connect;
    useEffect(() => {
        if (canAutoConnect && !tried.current) {
            tried.current = true;
            mutate();
        }
    }, [canAutoConnect, mutate]);

    return {
        connection,
        autoConnecting: connect.isPending || (canAutoConnect && connect.isIdle),
        autoConnectFailed: connect.isError,
    };
}
