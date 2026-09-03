"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Cloud, Link2, Loader2, Plus, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type CloudflareR2AccountSummary, type CloudflareR2BucketRecord } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

function suggestBucketName(orgSlug: string) {
    const shortId = Math.random().toString(36).slice(2, 8);
    return `opslin-${orgSlug || "org"}-${shortId}`.toLowerCase();
}

export default function StoragePage() {
    const queryClient = useQueryClient();

    // Connect form state
    const [token, setToken] = useState("");
    const [verifyResult, setVerifyResult] = useState<{ success: boolean; accounts?: CloudflareR2AccountSummary[]; message?: string } | null>(null);
    const [selectedAccountId, setSelectedAccountId] = useState("");

    // Create-bucket dialog state
    const [createOpen, setCreateOpen] = useState(false);
    const [newBucketName, setNewBucketName] = useState("");
    const [newBucketJurisdiction, setNewBucketJurisdiction] = useState<"default" | "eu">("default");

    // Wire dialog state
    const [wiringBucket, setWiringBucket] = useState<CloudflareR2BucketRecord | null>(null);
    const [wireAppId, setWireAppId] = useState("");
    const [wireEnvPrefix, setWireEnvPrefix] = useState("R2");

    // Delete confirm state
    const [deletingBucket, setDeletingBucket] = useState<CloudflareR2BucketRecord | null>(null);

    const { data: organization } = useQuery({
        queryKey: ["organization", "current"],
        queryFn: () => api.getCurrentOrganization(),
    });

    const { data: connection, isLoading: connectionLoading } = useQuery({
        queryKey: ["r2Connection"],
        queryFn: () => api.getR2Connection(),
    });

    const { data: bucketsData, isLoading: bucketsLoading } = useQuery({
        queryKey: ["r2Buckets"],
        queryFn: () => api.getR2Buckets(),
        enabled: Boolean(connection?.configured),
    });
    const buckets = bucketsData?.buckets || [];

    const { data: apps = [] } = useQuery({
        queryKey: ["allApps"],
        queryFn: () => api.getAllApps(),
        enabled: Boolean(wiringBucket),
    });

    // A field changing after a successful verify invalidates it — the
    // backend re-verifies at save time regardless, but the UI shouldn't let
    // "Connect" look ready off a verify that no longer matches what's typed.
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
            const account = verifyResult?.accounts?.find((a) => a.id === selectedAccountId);
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

    const disconnectMutation = useMutation({
        mutationFn: () => api.disconnectR2(),
        onSuccess: () => {
            toast.success("Disconnected");
            queryClient.invalidateQueries({ queryKey: ["r2Connection"] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to disconnect");
        },
    });

    const createBucketMutation = useMutation({
        mutationFn: () => api.createR2Bucket({
            bucketName: newBucketName.trim(),
            jurisdiction: newBucketJurisdiction === "eu" ? "eu" : undefined,
        }),
        onSuccess: () => {
            toast.success("Bucket created");
            setCreateOpen(false);
            setNewBucketName("");
            setNewBucketJurisdiction("default");
            queryClient.invalidateQueries({ queryKey: ["r2Buckets"] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to create the bucket");
        },
    });

    const deleteBucketMutation = useMutation({
        mutationFn: (bucketId: string) => api.deleteR2Bucket(bucketId),
        onSuccess: () => {
            toast.success("Bucket deleted");
            setDeletingBucket(null);
            queryClient.invalidateQueries({ queryKey: ["r2Buckets"] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to delete the bucket");
            setDeletingBucket(null);
        },
    });

    const wireMutation = useMutation({
        mutationFn: () => {
            if (!wiringBucket) throw new Error("No bucket selected");
            return api.wireR2Bucket(wiringBucket.id, { appId: wireAppId, envPrefix: wireEnvPrefix.trim() || undefined });
        },
        onSuccess: (result) => {
            toast.success(`${result.addedKeys.length} env var${result.addedKeys.length === 1 ? "" : "s"} added — redeploy to apply`);
            setWiringBucket(null);
            setWireAppId("");
            setWireEnvPrefix("R2");
            queryClient.invalidateQueries({ queryKey: ["r2Buckets"] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to wire this bucket into the app");
        },
    });

    const [corsBucket, setCorsBucket] = useState<CloudflareR2BucketRecord | null>(null);
    const [corsOrigins, setCorsOrigins] = useState("");
    const corsMutation = useMutation({
        mutationFn: () => {
            if (!corsBucket) throw new Error("No bucket selected");
            const origins = corsOrigins.split(/[\n,]/).map((o) => o.trim()).filter(Boolean);
            return api.setR2BucketCors(corsBucket.id, origins);
        },
        onSuccess: () => {
            toast.success("CORS policy updated — browser uploads to this bucket should work now");
            setCorsBucket(null);
            setCorsOrigins("");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to update this bucket's CORS policy");
        },
    });

    const canVerify = token.trim().length > 0;
    const canConnect = Boolean(verifyResult?.success && selectedAccountId.length > 0);
    const hasBuckets = buckets.length > 0;

    function openCreateDialog() {
        setNewBucketName(suggestBucketName(organization?.slug || ""));
        setNewBucketJurisdiction("default");
        setCreateOpen(true);
    }

    return (
        <>
            <Header
                title="Storage"
                description="Connect your Cloudflare account and provision R2 buckets for your apps."
            />

            <div className="dashboard-page max-w-5xl space-y-6">
                {/* Connection card */}
                <Card className="border-border/80 shadow-sm">
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Cloud className="size-5" />
                                </div>
                                <div>
                                    <CardTitle>Cloudflare account</CardTitle>
                                    <CardDescription>
                                        Connect your own Cloudflare account to provision R2 object storage buckets.
                                    </CardDescription>
                                </div>
                            </div>
                            {!connectionLoading && (
                                <Badge variant={connection?.configured ? "default" : "secondary"}>
                                    {connection?.configured ? "Connected" : "Not connected"}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    {connection?.configured ? (
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                                    <p className="text-xs font-medium uppercase text-muted-foreground">Account</p>
                                    <p className="mt-1 font-medium text-foreground">
                                        {connection.cloudflareAccountName || connection.cloudflareAccountId}
                                    </p>
                                </div>
                                {connection.lastVerifiedAt && (
                                    <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                                        <p className="text-xs font-medium uppercase text-muted-foreground">Last verified</p>
                                        <p className="mt-1 font-medium text-foreground">{formatRelativeTime(connection.lastVerifiedAt)}</p>
                                    </div>
                                )}
                            </div>
                            <Button
                                variant="outline"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => disconnectMutation.mutate()}
                                disabled={disconnectMutation.isPending || hasBuckets}
                            >
                                {disconnectMutation.isPending ? (
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                    <Trash2 className="mr-2 size-4" />
                                )}
                                Disconnect account
                            </Button>
                            {hasBuckets && (
                                <p className="text-xs text-muted-foreground">
                                    Delete the {buckets.length} bucket{buckets.length === 1 ? "" : "s"} linked to this account before disconnecting.
                                </p>
                            )}
                        </CardContent>
                    ) : (
                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="cfToken">Cloudflare API token</Label>
                                <Input
                                    id="cfToken"
                                    type="password"
                                    value={token}
                                    onChange={(event) => { setToken(event.target.value); invalidatePriorVerify(); }}
                                    placeholder="Paste a scoped Cloudflare API token"
                                    autoComplete="off"
                                />
                            </div>

                            {verifyResult && (
                                <div
                                    className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
                                        verifyResult.success
                                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                            : "border-destructive/30 bg-destructive/10 text-destructive"
                                    }`}
                                >
                                    {verifyResult.success ? (
                                        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                                    ) : (
                                        <XCircle className="mt-0.5 size-4 shrink-0" />
                                    )}
                                    <span>{verifyResult.success ? "Token verified — choose an account below." : verifyResult.message || "Verification failed"}</span>
                                </div>
                            )}

                            {verifyResult?.success && verifyResult.accounts && verifyResult.accounts.length > 0 && (
                                <div className="space-y-2">
                                    <Label>Cloudflare account</Label>
                                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                                        <SelectTrigger className="h-9 border-border/60 bg-background">
                                            <SelectValue placeholder="Select an account" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {verifyResult.accounts.map((account) => (
                                                <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Button
                                    variant="outline"
                                    onClick={() => verifyMutation.mutate()}
                                    disabled={!canVerify || verifyMutation.isPending}
                                    className="w-full sm:w-fit"
                                >
                                    {verifyMutation.isPending ? (
                                        <Loader2 className="mr-2 size-4 animate-spin" />
                                    ) : (
                                        <ShieldAlert className="mr-2 size-4" />
                                    )}
                                    Verify token
                                </Button>
                                <Button
                                    onClick={() => connectMutation.mutate()}
                                    disabled={!canConnect || connectMutation.isPending}
                                    className="w-full sm:w-fit"
                                >
                                    {connectMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                    Connect
                                </Button>
                            </div>
                            {canVerify && !verifyResult?.success && (
                                <p className="text-xs text-muted-foreground">
                                    Verify the token first — Opslin never saves an unverified credential.
                                </p>
                            )}
                        </CardContent>
                    )}
                </Card>

                {/* Buckets */}
                {connection?.configured && (
                    <Card className="border-border/80 shadow-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <CardTitle>Buckets</CardTitle>
                                    <CardDescription>Object storage buckets provisioned in your Cloudflare account.</CardDescription>
                                </div>
                                <Button size="sm" onClick={openCreateDialog}>
                                    <Plus className="mr-1.5 size-4" /> Create bucket
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {bucketsLoading ? (
                                <div className="rounded-xl border border-border/60 bg-card p-12 text-center">
                                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : !hasBuckets ? (
                                <div className="rounded-xl border border-border/60 bg-card p-10 text-center flex flex-col items-center">
                                    <Cloud size={56} className="mb-3 opacity-60" />
                                    <h3 className="text-base font-semibold text-foreground">No buckets yet</h3>
                                    <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                                        Create your first R2 bucket to give your apps durable, S3-compatible object storage.
                                    </p>
                                    <Button className="mt-5" onClick={openCreateDialog}>
                                        <Plus className="mr-1.5 size-4" /> Create your first bucket
                                    </Button>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border/60 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-border/60 bg-muted/30">
                                                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bucket</th>
                                                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endpoint</th>
                                                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wired to</th>
                                                    <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {buckets.map((bucket) => (
                                                    <tr key={bucket.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                                        <td className="py-3 px-4">
                                                            <div className="font-medium text-foreground">{bucket.bucketName}</div>
                                                            {bucket.jurisdiction && (
                                                                <div className="text-[11px] text-muted-foreground uppercase">{bucket.jurisdiction}</div>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{bucket.s3Endpoint}</td>
                                                        <td className="py-3 px-4 text-xs text-muted-foreground">
                                                            {bucket.wiredAppId ? `Wired (${bucket.wiredEnvPrefix})` : "Not wired"}
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-7 text-xs"
                                                                    onClick={() => {
                                                                        setWiringBucket(bucket);
                                                                        setWireAppId("");
                                                                        setWireEnvPrefix(bucket.wiredEnvPrefix || "R2");
                                                                    }}
                                                                >
                                                                    <Link2 className="mr-1.5 h-3.5 w-3.5" /> Wire to app
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-7 text-xs"
                                                                    onClick={() => {
                                                                        setCorsBucket(bucket);
                                                                        setCorsOrigins("");
                                                                    }}
                                                                >
                                                                    <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Fix CORS
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 w-7 p-0 text-danger-text"
                                                                    onClick={() => setDeletingBucket(bucket)}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Create bucket dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create R2 bucket</DialogTitle>
                        <DialogDescription>Provisions a real bucket in your connected Cloudflare account.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="newBucketName">Bucket name</Label>
                            <Input
                                id="newBucketName"
                                value={newBucketName}
                                onChange={(event) => setNewBucketName(event.target.value)}
                                placeholder="opslin-acme-ab12cd"
                            />
                            <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens only.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Jurisdiction</Label>
                            <Select value={newBucketJurisdiction} onValueChange={(value) => setNewBucketJurisdiction(value as "default" | "eu")}>
                                <SelectTrigger className="h-9 border-border/60 bg-background"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">Default</SelectItem>
                                    <SelectItem value="eu">EU (GDPR-restricted)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button onClick={() => createBucketMutation.mutate()} disabled={!newBucketName.trim() || createBucketMutation.isPending}>
                            {createBucketMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
                            Create bucket
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Wire to app dialog */}
            <Dialog open={!!wiringBucket} onOpenChange={(open) => !open && setWiringBucket(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Wire bucket to an app</DialogTitle>
                        <DialogDescription>Adds this bucket&apos;s credentials as environment variables on the app. Does not redeploy.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>App</Label>
                            <Select value={wireAppId} onValueChange={setWireAppId}>
                                <SelectTrigger className="h-9 border-border/60 bg-background"><SelectValue placeholder="Select an app" /></SelectTrigger>
                                <SelectContent>
                                    {apps.map((app) => (
                                        <SelectItem key={app.id} value={app.id}>{app.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="envPrefix">Env var prefix</Label>
                            <Input
                                id="envPrefix"
                                value={wireEnvPrefix}
                                onChange={(event) => setWireEnvPrefix(event.target.value.toUpperCase())}
                                placeholder="R2"
                            />
                            <p className="text-xs text-muted-foreground">
                                Adds {wireEnvPrefix || "R2"}_ACCESS_KEY_ID, _SECRET_ACCESS_KEY, _ENDPOINT, and _BUCKET.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setWiringBucket(null)}>Cancel</Button>
                        <Button onClick={() => wireMutation.mutate()} disabled={!wireAppId || wireMutation.isPending}>
                            {wireMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Link2 className="mr-2 size-4" />}
                            Wire to app
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Fix CORS dialog */}
            <Dialog open={!!corsBucket} onOpenChange={(open) => !open && setCorsBucket(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Fix CORS for {corsBucket?.bucketName}</DialogTitle>
                        <DialogDescription>
                            New buckets have no CORS policy — a browser uploading directly to this bucket (e.g. a presigned PUT URL) will be blocked until you allow its origin here.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="corsOrigins">Allowed origin(s)</Label>
                        <Textarea
                            id="corsOrigins"
                            value={corsOrigins}
                            onChange={(event) => setCorsOrigins(event.target.value)}
                            placeholder={"https://your-app.example.com\nhttps://your-app.mono.opslin.com"}
                            rows={4}
                            className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                            One origin per line (or comma-separated) — the exact scheme + host your app's frontend runs on, not the bucket URL itself. This replaces any existing CORS rules on this bucket.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCorsBucket(null)}>Cancel</Button>
                        <Button
                            onClick={() => corsMutation.mutate()}
                            disabled={!corsOrigins.trim() || corsMutation.isPending}
                        >
                            {corsMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldAlert className="mr-2 size-4" />}
                            Apply CORS policy
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete confirm */}
            <AlertDialog open={!!deletingBucket} onOpenChange={(open) => !open && setDeletingBucket(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete bucket?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently deletes <strong>{deletingBucket?.bucketName}</strong> from Cloudflare. The bucket must be empty — Opslin will not force-empty it for you.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteBucketMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deletingBucket && deleteBucketMutation.mutate(deletingBucket.id)}
                            disabled={deleteBucketMutation.isPending}
                            className="bg-danger hover:bg-danger/90"
                        >
                            {deleteBucketMutation.isPending ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
                            ) : (
                                <><Trash2 className="h-4 w-4 mr-2" />Delete</>
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
