"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CloudflareMark } from "@/components/media/media-rows";
import { useCloudflareSignIn } from "@/components/media/use-cloudflare-sign-in";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiRequestError, api, type CloudflareR2AccountSummary } from "@/lib/api";

type Returned = "connected" | "denied" | "error" | "blocked" | null;

const RETURN_LINES: Record<string, string> = {
    denied: "Cloudflare sign-in was cancelled.",
    error: "Cloudflare sign-in didn't finish. Try again.",
    blocked: "Cloudflare sign-in didn't finish. Try again.",
};

/**
 * "Sign in with Cloudflare" for Storage (the same Cloudflare app Media uses). After Cloudflare sends the
 * browser back with ?cloudflare=connected, the account is picked (or taken when there is only one) and
 * Opslin saves the connection itself — nobody pastes a token.
 */
export function CloudflareSignIn({ alreadySignedIn = false }: { alreadySignedIn?: boolean }) {
    const queryClient = useQueryClient();
    const signIn = useCloudflareSignIn(() => api.startStorageCloudflareSignIn());
    const [returned, setReturned] = useState<Returned>(null);
    const [accountId, setAccountId] = useState("");
    const autoStarted = useRef(false);

    // Read the result Cloudflare sent back, then clean the address bar so a refresh doesn't repeat it.
    useEffect(() => {
        const value = new URLSearchParams(window.location.search).get("cloudflare");
        if (value) {
            // The address is only readable in the browser, so it can't seed the initial state without a hydration mismatch.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setReturned(value as Returned);
            window.history.replaceState(null, "", window.location.pathname);
        }
    }, []);

    const accounts = useQuery({
        queryKey: ["r2SignInAccounts"],
        queryFn: () => api.getStorageCloudflareAccounts(),
        enabled: returned === "connected" || alreadySignedIn,
        retry: false,
    });
    const list: CloudflareR2AccountSummary[] = useMemo(() => accounts.data?.accounts ?? [], [accounts.data]);

    const connect = useMutation({
        mutationFn: (account: CloudflareR2AccountSummary) =>
            api.saveR2Connection({ signIn: true, cloudflareAccountId: account.id, cloudflareAccountName: account.name }),
        onSuccess: () => {
            toast.success("Cloudflare account connected");
            queryClient.removeQueries({ queryKey: ["r2SignInAccounts"] });
            queryClient.invalidateQueries({ queryKey: ["r2Connection"] });
        },
    });

    // One account: nothing to choose, so connect it straight away.
    useEffect(() => {
        if (list.length === 1 && !autoStarted.current) {
            autoStarted.current = true;
            connect.mutate(list[0]);
        }
    }, [list, connect]);

    const connectError = connect.error instanceof Error ? connect.error.message : null;
    const accountsGone = accounts.error instanceof ApiRequestError && accounts.error.status === 409;
    const accountsFailed = accounts.isError && !accountsGone;
    const arrived = returned === "connected" || alreadySignedIn;
    const choosing = arrived && list.length > 1 && !connect.isPending;
    const connecting = connect.isPending || (arrived && (accounts.isLoading || (list.length === 1 && !connectError)));

    const line =
        signIn.line ??
        connectError ??
        (accountsFailed ? "Couldn't load your Cloudflare accounts. Sign in again." : null) ??
        (returned && returned !== "connected" ? RETURN_LINES[returned] ?? null : null) ??
        (arrived && !accounts.isLoading && list.length === 0 && !accountsGone && !accountsFailed
            ? "No Cloudflare account found for this sign-in."
            : null);

    return (
        <div>
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-sm font-medium">
                    <CloudflareMark />
                    {connecting ? "Connecting your account" : choosing ? "Choose an account" : "Cloudflare"}
                </div>
                {connecting ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Connecting" />
                ) : choosing ? (
                    <div className="flex items-center gap-2">
                        <Select value={accountId} onValueChange={setAccountId}>
                            <SelectTrigger className="h-9 w-56 border-border/60 bg-background" aria-label="Cloudflare account">
                                <SelectValue placeholder="Select an account" />
                            </SelectTrigger>
                            <SelectContent>
                                {list.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            disabled={!accountId}
                            onClick={() => {
                                const account = list.find((item) => item.id === accountId);
                                if (account) connect.mutate(account);
                            }}
                        >
                            Connect
                        </Button>
                    </div>
                ) : (
                    <Button onClick={signIn.start} disabled={signIn.pending}>
                        {signIn.pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        Sign in with Cloudflare
                    </Button>
                )}
            </div>
            {line && (
                <p className="pb-2 text-sm text-destructive" role="alert">
                    {line}
                </p>
            )}
        </div>
    );
}
