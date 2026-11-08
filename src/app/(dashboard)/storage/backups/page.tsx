"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, Database, Loader2, Lock, MoreHorizontal, Package, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CloudflareMark, Disclosure } from "@/components/media/media-rows";
import { SkeletonText } from "@/components/patterns/skeleton";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStorageConnection } from "@/components/storage/use-storage-connection";
import { api, type BackupStorageInput, type BackupStorageProvider } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

// "S3" is the standard way storage services accept files. Amazon invented it and Cloudflare R2, Backblaze, MinIO and
// others speak it too, which is why they all ask for the same few fields.
const providerOptions: { value: BackupStorageProvider; label: string; needsEndpoint: boolean }[] = [
    { value: "aws_s3", label: "Amazon S3", needsEndpoint: false },
    { value: "cloudflare_r2", label: "Cloudflare R2 (with access keys)", needsEndpoint: true },
    { value: "s3_compatible", label: "Another S3-compatible service", needsEndpoint: true },
];

/**
 * The whole idea of this page in one picture: your databases save straight into a bucket you own.
 * Before a bucket is chosen the right-hand end is an empty dashed place; after, it is the real bucket.
 */
function BackupFlow({ bucket, r2, reduceMotion }: { bucket: string | null; r2: boolean; reduceMotion: boolean | null }) {
    const live = Boolean(bucket);
    return (
        <div className="flex w-full max-w-md items-center gap-2 px-4">
            <div className="flex w-24 shrink-0 flex-col items-center gap-2 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl border border-border/70 bg-card shadow-sm">
                    <Database className="size-6 text-foreground/80" aria-hidden="true" />
                </span>
                <span className="text-xs font-medium text-muted-foreground">Your databases</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5" aria-hidden="true">
                <svg viewBox="0 0 100 8" className="h-2 w-full overflow-visible" preserveAspectRatio="none">
                    <motion.line
                        x1="0" y1="4" x2="100" y2="4"
                        strokeWidth="2" strokeLinecap="round" strokeDasharray="5 6"
                        className={live ? "stroke-emerald-500" : "stroke-border"}
                        vectorEffect="non-scaling-stroke"
                        animate={live && !reduceMotion ? { strokeDashoffset: [0, -22] } : undefined}
                        transition={{ duration: 1.1, ease: "linear", repeat: Infinity }}
                    />
                </svg>
                <ArrowRight className={cn("size-3.5", live ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50")} />
                <span className="text-[11px] font-medium text-muted-foreground">Direct to your bucket</span>
            </div>
            <div className="flex w-28 shrink-0 flex-col items-center gap-2 text-center">
                <span
                    className={cn(
                        "flex size-14 items-center justify-center rounded-2xl",
                        live ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "border border-dashed border-border"
                    )}
                >
                    {live ? r2 ? <CloudflareMark /> : <Package className="size-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <Package className="size-6 text-muted-foreground/50" aria-hidden="true" />}
                </span>
                <span className="w-full truncate text-xs font-medium text-muted-foreground">{bucket ?? "Choose a bucket"}</span>
            </div>
        </div>
    );
}

export default function BackupsPage() {
    const queryClient = useQueryClient();
    const [provider, setProvider] = useState<BackupStorageProvider>("aws_s3");
    const [bucket, setBucket] = useState("");
    const [region, setRegion] = useState("");
    const [endpoint, setEndpoint] = useState("");
    const [accessKeyId, setAccessKeyId] = useState("");
    const [secretAccessKey, setSecretAccessKey] = useState("");
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);
    const reduceMotion = useReducedMotion();

    const { connection: cloudflare } = useStorageConnection();
    const { data: storageBuckets } = useQuery({
        queryKey: ["r2Buckets"],
        queryFn: () => api.getR2Buckets(),
    });
    const bucketChoices = storageBuckets?.buckets ?? [];

    const providerMeta = providerOptions.find((option) => option.value === provider) || providerOptions[0];

    const { data: status, isLoading } = useQuery({
        queryKey: ["backupStorage"],
        queryFn: () => api.getBackupStorage(),
    });

    const currentInput = (): BackupStorageInput => ({
        provider,
        bucket: bucket.trim(),
        region: region.trim() || undefined,
        endpoint: providerMeta.needsEndpoint ? endpoint.trim() : undefined,
        accessKeyId: accessKeyId.trim(),
        secretAccessKey,
    });

    // A field changing after a successful test invalidates that test — the
    // backend re-verifies at save time regardless, but the UI shouldn't let
    // "Save" look ready off a test that no longer matches what's typed.
    function invalidatePriorTest() {
        setTestResult(null);
    }

    const testMutation = useMutation({
        mutationFn: () => api.testBackupStorage(currentInput()),
        onSuccess: (result) => {
            setTestResult(result);
            if (result.success) {
                toast.success("Bucket is reachable and writable");
            } else {
                toast.error(result.message);
            }
        },
        onError: (error) => {
            const message = error instanceof Error ? error.message : "Could not test the connection";
            setTestResult({ success: false, message });
            toast.error(message);
        },
    });

    const saveMutation = useMutation({
        mutationFn: () => api.saveBackupStorage(currentInput()),
        onSuccess: () => {
            toast.success("Backup storage connected");
            setAccessKeyId("");
            setSecretAccessKey("");
            setTestResult(null);
            queryClient.invalidateQueries({ queryKey: ["backupStorage"] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to save backup storage");
        },
    });

    const disconnectMutation = useMutation({
        mutationFn: () => api.disconnectBackupStorage(),
        onSuccess: (result) => {
            toast.success(
                result.disabledScheduleCount > 0
                    ? `Disconnected — ${result.disabledScheduleCount} backup schedule(s) were paused`
                    : "Disconnected"
            );
            setConfirmDisconnect(false);
            queryClient.invalidateQueries({ queryKey: ["backupStorage"] });
        },
        onError: (error) => {
            setConfirmDisconnect(false);
            toast.error(error instanceof Error ? error.message : "Unable to disconnect");
        },
    });

    const useBucketMutation = useMutation({
        mutationFn: (bucketId: string) => api.useStorageBucketForBackups(bucketId),
        onSuccess: () => {
            toast.success("Backups will use this bucket");
            queryClient.invalidateQueries({ queryKey: ["backupStorage"] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to use this bucket");
        },
    });

    const cloudflareConnected = Boolean(cloudflare.data?.configured);
    const canSubmit =
        bucket.trim().length > 0 &&
        accessKeyId.trim().length > 0 &&
        secretAccessKey.length > 0 &&
        (!providerMeta.needsEndpoint || endpoint.trim().length > 0);

    const configured = Boolean(status?.configured);
    const providerLabel = providerOptions.find((option) => option.value === status?.provider)?.label || status?.provider;

    if (isLoading) {
        return (
            <div className="dashboard-page max-w-5xl" aria-busy="true" aria-label="Loading backups">
                <Card className="gap-0 p-5">
                    <div className="flex items-center gap-4">
                        <SkeletonText className="size-12 rounded-xl" />
                        <div className="space-y-2">
                            <SkeletonText className="h-4 w-36" />
                            <SkeletonText className="h-3.5 w-52" />
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    // A Cloudflare destination is hidden (the API sends no bucket name) until the Cloudflare sign-in is live again.
    if (status?.needsCloudflareSignIn) {
        return (
            <div className="dashboard-page max-w-5xl">
                <Card className="items-center gap-3 border-dashed bg-transparent p-10 text-center shadow-none">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <Lock className="size-5" aria-hidden="true" />
                    </span>
                    <h2 className="text-base font-semibold">Sign in with Cloudflare to open Backups</h2>
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
        <div className="dashboard-page max-w-5xl">
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}>
                <Card className="gap-0 overflow-hidden py-0">
                    <div className="relative flex h-40 items-center justify-center border-b border-border/70 bg-muted/40">
                        <BackupFlow bucket={configured ? status?.bucket ?? null : null} r2={status?.provider === "cloudflare_r2"} reduceMotion={reduceMotion} />
                        {configured ? (
                            <div className="absolute right-2 top-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="size-8" aria-label="Backup storage options">
                                            <MoreHorizontal className="size-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmDisconnect(true)}>
                                            Disconnect bucket
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ) : null}
                    </div>
                    <div className="p-5">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="truncate text-xl font-semibold tracking-tight">{configured ? status?.bucket : "Choose where backups go"}</h2>
                            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", configured ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
                                {configured ? "Connected" : "Not set up"}
                            </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {configured
                                ? `${providerLabel}${status?.lastVerifiedAt ? ` · Verified ${formatRelativeTime(status.lastVerifiedAt)}` : ""}`
                                : "Database backups are saved straight to your own bucket."}
                        </p>
                    </div>

                    {bucketChoices.length > 0 ? (
                        <div className="border-t border-border/70 px-5 py-4">
                            <p className="mb-3 text-xs font-medium text-muted-foreground">{configured ? "Switch to another bucket" : "Your buckets"}</p>
                            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {bucketChoices.map((item) => {
                                    const active = Boolean(status?.configured && status.provider === "cloudflare_r2" && status.bucket === item.bucketName);
                                    const busy = useBucketMutation.isPending && useBucketMutation.variables === item.id;
                                    return (
                                        <li key={item.id}>
                                            <button
                                                type="button"
                                                disabled={active || useBucketMutation.isPending}
                                                onClick={() => useBucketMutation.mutate(item.id)}
                                                aria-pressed={active}
                                                className={cn(
                                                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left outline-none transition-[border-color,background-color,transform] duration-150 ease-out",
                                                    "focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.985] motion-reduce:transition-none",
                                                    active ? "border-emerald-500/40 bg-emerald-500/5" : "border-border hover:border-foreground/30 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/40"
                                                )}
                                            >
                                                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                    <Package className="size-[18px]" aria-hidden="true" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium">{item.bucketName}</span>
                                                    <span className="block text-xs text-muted-foreground">{active ? "In use" : "Use for backups"}</span>
                                                </span>
                                                {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : active ? <Check className="size-4 text-emerald-600" aria-hidden="true" /> : null}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ) : cloudflareConnected ? (
                        <div className="flex min-h-14 items-center justify-between gap-3 border-t border-border/70 px-5 text-sm">
                            <span className="text-muted-foreground">No buckets yet</span>
                            <Button asChild variant="outline"><Link href="/storage/buckets">Create a bucket</Link></Button>
                        </div>
                    ) : (
                        <div className="flex min-h-14 items-center justify-between gap-3 border-t border-border/70 px-5 text-sm">
                            <span className="text-muted-foreground">Cloudflare isn&apos;t connected</span>
                            <Button asChild variant="outline"><Link href="/storage">Connect Cloudflare</Link></Button>
                        </div>
                    )}

                    <Disclosure label="Use Amazon S3 or another storage service">
                        <div className="space-y-5 border-t border-border/70 px-5 py-5">
                            <p className="text-sm text-muted-foreground">
                                {cloudflareConnected
                                    ? "Using Cloudflare? Pick one of your buckets above, no keys needed. This form is for Amazon S3 and other storage services."
                                    : "S3 is the standard way storage services accept files. Amazon S3, Cloudflare R2, Backblaze and MinIO all use it."}
                            </p>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Storage service</Label>
                                    <Select value={provider} onValueChange={(value) => { setProvider(value as BackupStorageProvider); invalidatePriorTest(); }}>
                                        <SelectTrigger className="h-9 border-border/60 bg-background"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {providerOptions.filter((option) => !(cloudflareConnected && option.value === "cloudflare_r2")).map((option) => (
                                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="bucket">Bucket name (where backups are saved)</Label>
                                    <Input id="bucket" value={bucket} onChange={(event) => { setBucket(event.target.value); invalidatePriorTest(); }} placeholder="my-opslin-backups" />
                                </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {providerMeta.needsEndpoint ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="endpoint">Service address (endpoint)</Label>
                                        <Input
                                            id="endpoint"
                                            value={endpoint}
                                            onChange={(event) => { setEndpoint(event.target.value); invalidatePriorTest(); }}
                                            placeholder={provider === "cloudflare_r2" ? "https://<account-id>.r2.cloudflarestorage.com" : "https://your-storage-host:9000"}
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Label htmlFor="region">Region</Label>
                                        <Input id="region" value={region} onChange={(event) => { setRegion(event.target.value); invalidatePriorTest(); }} placeholder="ap-south-1" />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="accessKeyId">Access key ID</Label>
                                    <Input id="accessKeyId" value={accessKeyId} onChange={(event) => { setAccessKeyId(event.target.value); invalidatePriorTest(); }} autoComplete="off" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="secretAccessKey">Secret access key</Label>
                                <Input id="secretAccessKey" type="password" value={secretAccessKey} onChange={(event) => { setSecretAccessKey(event.target.value); invalidatePriorTest(); }} autoComplete="off" />
                            </div>

                            {testResult ? (
                                <div
                                    role="status"
                                    className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
                                        testResult.success
                                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                            : "border-destructive/30 bg-destructive/10 text-destructive"
                                    }`}
                                >
                                    {testResult.success ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
                                    <span>{testResult.message}</span>
                                </div>
                            ) : null}

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Button variant="outline" onClick={() => testMutation.mutate()} disabled={!canSubmit || testMutation.isPending} className="w-full sm:w-fit">
                                    {testMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldAlert className="mr-2 size-4" />}
                                    Test connection
                                </Button>
                                <Button onClick={() => saveMutation.mutate()} disabled={!canSubmit || !testResult?.success || saveMutation.isPending} className="w-full sm:w-fit">
                                    {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                    Save changes
                                </Button>
                            </div>
                        </div>
                    </Disclosure>
                </Card>
            </motion.div>

            <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect this bucket?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Scheduled database backups pause until you choose a bucket again. Backups already saved stay in your bucket.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={disconnectMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
