"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type CloudflareR2AccountSummary } from "@/lib/api";

type VerifyResult = { success: boolean; accounts?: CloudflareR2AccountSummary[]; message?: string };

/**
 * "Use an API token instead" for people who can't sign in with Cloudflare. Verify first, then connect:
 * a token that was never verified is never saved (the API re-checks at save time as well).
 */
export function CloudflareTokenConnect() {
    const queryClient = useQueryClient();
    const [token, setToken] = useState("");
    const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
    const [selectedAccountId, setSelectedAccountId] = useState("");

    // A field changing after a successful verify invalidates it, so "Connect" never looks ready off a stale check.
    function invalidatePriorVerify() {
        setVerifyResult(null);
        setSelectedAccountId("");
    }

    const verifyMutation = useMutation({
        mutationFn: () => api.verifyR2Connection(token.trim()),
        onSuccess: (result) => {
            setVerifyResult(result);
            if (result.success) {
                toast.success("Cloudflare token verified");
                if (result.accounts?.length === 1) {
                    setSelectedAccountId(result.accounts[0].id);
                }
            } else {
                toast.error(result.message || "Could not verify this token");
            }
        },
        onError: (error) => {
            const message = error instanceof Error ? error.message : "Could not verify this token";
            setVerifyResult({ success: false, message });
            toast.error(message);
        },
    });

    const connectMutation = useMutation({
        mutationFn: () => {
            const account = verifyResult?.accounts?.find((item) => item.id === selectedAccountId);
            return api.saveR2Connection({
                token: token.trim(),
                cloudflareAccountId: selectedAccountId,
                cloudflareAccountName: account?.name,
            });
        },
        onSuccess: () => {
            toast.success("Cloudflare account connected");
            setToken("");
            setVerifyResult(null);
            setSelectedAccountId("");
            queryClient.invalidateQueries({ queryKey: ["r2Connection"] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to connect this Cloudflare account");
        },
    });

    const canVerify = token.trim().length > 0;
    const canConnect = Boolean(verifyResult?.success && selectedAccountId.length > 0);

    return (
        <div className="space-y-5 px-5 pb-5">
            <div className="space-y-2">
                <Label htmlFor="cfToken">Cloudflare API token</Label>
                <Input
                    id="cfToken"
                    type="password"
                    value={token}
                    onChange={(event) => {
                        setToken(event.target.value);
                        invalidatePriorVerify();
                    }}
                    placeholder="Paste a scoped Cloudflare API token"
                    autoComplete="off"
                />
            </div>

            {verifyResult ? (
                <div
                    role="status"
                    className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
                        verifyResult.success
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                    }`}
                >
                    {verifyResult.success ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
                    <span>{verifyResult.success ? "Token verified. Choose an account." : verifyResult.message || "Verification failed"}</span>
                </div>
            ) : null}

            {verifyResult?.success && verifyResult.accounts && verifyResult.accounts.length > 0 ? (
                <div className="space-y-2">
                    <Label>Cloudflare account</Label>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                        <SelectTrigger className="h-9 border-border/60 bg-background">
                            <SelectValue placeholder="Select an account" />
                        </SelectTrigger>
                        <SelectContent>
                            {verifyResult.accounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                    {account.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="outline" onClick={() => verifyMutation.mutate()} disabled={!canVerify || verifyMutation.isPending} className="w-full sm:w-fit">
                    {verifyMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldAlert className="mr-2 size-4" />}
                    Verify token
                </Button>
                <Button onClick={() => connectMutation.mutate()} disabled={!canConnect || connectMutation.isPending} className="w-full sm:w-fit">
                    {connectMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Connect
                </Button>
            </div>
        </div>
    );
}
