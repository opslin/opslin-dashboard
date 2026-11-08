"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { KeyRound, Link2, Loader2, Lock, MoreHorizontal, Package, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CloudflareMark } from "@/components/media/media-rows";
import { SkeletonText } from "@/components/patterns/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BucketCredentialsDialog } from "@/components/storage/bucket-credentials-dialog";
import { useStorageConnection } from "@/components/storage/use-storage-connection";
import { useMedia } from "@/hooks/use-media";
import { api, type CloudflareR2BucketRecord } from "@/lib/api";

function suggestBucketName(orgSlug: string) {
    const shortId = Math.random().toString(36).slice(2, 8);
    return `opslin-${orgSlug || "org"}-${shortId}`.toLowerCase();
}

export default function StoragePage() {
    const queryClient = useQueryClient();

    // Create-bucket dialog state
    const [createOpen, setCreateOpen] = useState(false);
    const [newBucketName, setNewBucketName] = useState("");
    const [newBucketJurisdiction, setNewBucketJurisdiction] = useState<"default" | "eu">("default");

    // Wire dialog state
    const [wiringBucket, setWiringBucket] = useState<CloudflareR2BucketRecord | null>(null);
    const [wireAppId, setWireAppId] = useState("");
    const [wireEnvPrefix, setWireEnvPrefix] = useState("R2");

    // Show connection details
    const [detailsBucket, setDetailsBucket] = useState<CloudflareR2BucketRecord | null>(null);

    // Delete confirm state
    const [deletingBucket, setDeletingBucket] = useState<CloudflareR2BucketRecord | null>(null);

    const { data: organization } = useQuery({
        queryKey: ["organization", "current"],
        queryFn: () => api.getCurrentOrganization(),
    });

    const { connection: connectionQuery, autoConnecting } = useStorageConnection();
    const connection = connectionQuery.data;
    const connectionLoading = connectionQuery.isLoading || autoConnecting;

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

    const hasBuckets = buckets.length > 0;

    function openCreateDialog() {
        setNewBucketName(suggestBucketName(organization?.slug || ""));
        setNewBucketJurisdiction("default");
        setCreateOpen(true);
    }

    const reduceMotion = useReducedMotion();

    // What each bucket is used for, so the list says it instead of the person having to remember.
    const { data: backupStorage } = useQuery({ queryKey: ["backupStorage"], queryFn: () => api.getBackupStorage() });
    const { data: mediaState } = useMedia();
    const mediaBucket = mediaState && !mediaState.locked && mediaState.media.configured ? mediaState.media.bucketName : null;
    function usedBy(bucket: CloudflareR2BucketRecord) {
        if (backupStorage?.configured && backupStorage.provider === "cloudflare_r2" && backupStorage.bucket === bucket.bucketName) return "Backups";
        if (mediaBucket && mediaBucket === bucket.bucketName) return "Media";
        if (bucket.wiredAppId) return `App (${bucket.wiredEnvPrefix || "R2"})`;
        return null;
    }

    if (connectionLoading) {
        return (
            <div className="dashboard-page max-w-5xl" aria-busy="true" aria-label="Loading buckets">
                <Card className="gap-0 py-0">
                    {Array.from({ length: 3 }, (_, index) => (
                        <div key={index} className="flex h-16 items-center gap-4 border-b border-border/70 px-5 last:border-0">
                            <SkeletonText className="size-9 rounded-lg" />
                            <SkeletonText className="h-4 w-40" />
                        </div>
                    ))}
                </Card>
            </div>
        );
    }

    // Buckets live in the customer's Cloudflare account, so without the sign-in there is nothing to list.
    if (!connection?.configured || connection.needsReconnect) {
        return (
            <div className="dashboard-page max-w-5xl">
                <Card className="items-center gap-3 border-dashed bg-transparent p-10 text-center shadow-none">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <Lock className="size-5" aria-hidden="true" />
                    </span>
                    <h2 className="text-base font-semibold">Buckets need Cloudflare</h2>
                    <Button asChild>
                        <Link href="/storage">
                            <CloudflareMark className="mr-2 h-4" />
                            Sign in with Cloudflare
                        </Link>
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <>
            <div className="dashboard-page max-w-5xl">
                <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground" aria-live="polite">
                        {bucketsLoading ? "\u00a0" : hasBuckets ? `${buckets.length} ${buckets.length === 1 ? "bucket" : "buckets"} in ${connection.cloudflareAccountName || "your Cloudflare account"}` : "No buckets yet"}
                    </p>
                </div>

                {bucketsLoading ? (
                    <Card className="gap-0 py-0" aria-busy="true">
                        {Array.from({ length: 3 }, (_, index) => (
                            <div key={index} className="flex h-16 items-center gap-4 border-b border-border/70 px-5 last:border-0">
                                <SkeletonText className="size-9 rounded-lg" />
                                <SkeletonText className="h-4 w-40" />
                            </div>
                        ))}
                    </Card>
                ) : !hasBuckets ? (
                    <Card className="items-center gap-3 border-dashed bg-transparent p-12 text-center shadow-none">
                        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Package className="size-6" aria-hidden="true" />
                        </span>
                        <h2 className="text-base font-semibold">Create your first bucket</h2>
                        <Button onClick={openCreateDialog}>
                            <Plus className="mr-1.5 size-4" /> New bucket
                        </Button>
                    </Card>
                ) : (
                    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {buckets.map((bucket, index) => {
                            const owner = usedBy(bucket);
                            const inUse = owner === "Backups" || owner === "Media";
                            return (
                                <motion.li
                                    key={bucket.id}
                                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1], delay: Math.min(index, 6) * 0.04 }}
                                >
                                    <Card className="h-full gap-0 overflow-hidden py-0 transition-[box-shadow,border-color] duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:border-foreground/25 [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-md motion-reduce:transition-none">
                                        <div className="relative flex h-24 items-center justify-center border-b border-border/70 bg-muted/40">
                                            <span className={cn("flex size-12 items-center justify-center rounded-xl shadow-sm ring-1", owner ? "bg-primary/10 text-primary ring-primary/20" : "bg-card text-muted-foreground ring-border")}>
                                                <Package className="size-6" aria-hidden="true" />
                                            </span>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-8" aria-label={`Options for ${bucket.bucketName}`}>
                                                        <MoreHorizontal className="size-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => setDetailsBucket(bucket)}>
                                                        <KeyRound className="mr-2 size-4" /> Show connection details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onSelect={() => {
                                                            setWiringBucket(bucket);
                                                            setWireAppId("");
                                                            setWireEnvPrefix(bucket.wiredEnvPrefix || "R2");
                                                        }}
                                                    >
                                                        <Link2 className="mr-2 size-4" /> Wire to an app
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onSelect={() => {
                                                            setCorsBucket(bucket);
                                                            setCorsOrigins("");
                                                        }}
                                                    >
                                                        <ShieldAlert className="mr-2 size-4" /> Allow browser uploads
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        disabled={inUse}
                                                        className="text-destructive focus:text-destructive"
                                                        onSelect={() => setDeletingBucket(bucket)}
                                                    >
                                                        <Trash2 className="mr-2 size-4" />
                                                        {inUse ? `Delete (used by ${owner})` : "Delete bucket"}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                        <div className="p-4">
                                            <p className="truncate text-sm font-semibold text-foreground">{bucket.bucketName}</p>
                                            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                                {bucket.jurisdiction ? `${bucket.jurisdiction.toUpperCase()} · ` : ""}{bucket.s3Endpoint.replace("https://", "")}
                                            </p>
                                            <span className={cn("mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium", owner ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                                                {owner ? `Used by ${owner}` : "Not used yet"}
                                            </span>
                                        </div>
                                    </Card>
                                </motion.li>
                            );
                        })}
                        <li>
                            <button
                                type="button"
                                onClick={openCreateDialog}
                                className="group flex h-full min-h-[11.5rem] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground outline-none transition-[color,border-color,transform] duration-150 ease-out hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.985] motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:border-foreground/30"
                            >
                                <span className="flex size-10 items-center justify-center rounded-full bg-muted"><Plus className="size-5" aria-hidden="true" /></span>
                                New bucket
                            </button>
                        </li>
                    </ul>
                )}
            </div>

            <BucketCredentialsDialog bucket={detailsBucket} onClose={() => setDetailsBucket(null)} />

            {/* Create bucket dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New bucket</DialogTitle>
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
                        <DialogTitle>Allow browser uploads to {corsBucket?.bucketName}</DialogTitle>
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
                            One origin per line (or comma-separated) — the exact scheme + host your app&apos;s frontend runs on, not the bucket URL itself. This replaces any existing CORS rules on this bucket.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCorsBucket(null)}>Cancel</Button>
                        <Button
                            onClick={() => corsMutation.mutate()}
                            disabled={!corsOrigins.trim() || corsMutation.isPending}
                        >
                            {corsMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldAlert className="mr-2 size-4" />}
                            Allow uploads
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
