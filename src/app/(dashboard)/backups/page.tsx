"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, HardDrive, Loader2, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type BackupStorageInput, type BackupStorageProvider } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

const providerOptions: { value: BackupStorageProvider; label: string; needsEndpoint: boolean }[] = [
    { value: "aws_s3", label: "Amazon S3", needsEndpoint: false },
    { value: "cloudflare_r2", label: "Cloudflare R2", needsEndpoint: true },
    { value: "s3_compatible", label: "S3-compatible (MinIO, Backblaze, etc.)", needsEndpoint: true },
];

export default function BackupsPage() {
    const queryClient = useQueryClient();
    const [provider, setProvider] = useState<BackupStorageProvider>("aws_s3");
    const [bucket, setBucket] = useState("");
    const [region, setRegion] = useState("");
    const [endpoint, setEndpoint] = useState("");
    const [accessKeyId, setAccessKeyId] = useState("");
    const [secretAccessKey, setSecretAccessKey] = useState("");
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

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
            queryClient.invalidateQueries({ queryKey: ["backupStorage"] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to disconnect");
        },
    });

    const canSubmit =
        bucket.trim().length > 0 &&
        accessKeyId.trim().length > 0 &&
        secretAccessKey.length > 0 &&
        (!providerMeta.needsEndpoint || endpoint.trim().length > 0);

    return (
        <>
            <Header
                title="Backups"
                description="Connect your own S3, Cloudflare R2, or S3-compatible bucket for database backups."
            />

            <div className="dashboard-page max-w-4xl space-y-6">
                <Card className="border-border/80 shadow-sm">
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <HardDrive className="size-5" />
                                </div>
                                <div>
                                    <CardTitle>Storage status</CardTitle>
                                    <CardDescription>
                                        Database backups land directly in your own bucket — Opslin never stores a copy.
                                    </CardDescription>
                                </div>
                            </div>
                            {!isLoading && (
                                <Badge variant={status?.configured ? "default" : "secondary"}>
                                    {status?.configured ? "Connected" : "Not connected"}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    {status?.configured && (
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                                    <p className="text-xs font-medium uppercase text-muted-foreground">Provider</p>
                                    <p className="mt-1 font-medium text-foreground">
                                        {providerOptions.find((option) => option.value === status.provider)?.label || status.provider}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                                    <p className="text-xs font-medium uppercase text-muted-foreground">Bucket</p>
                                    <p className="mt-1 truncate font-medium text-foreground">{status.bucket}</p>
                                </div>
                            </div>
                            {status.lastVerifiedAt && (
                                <p className="text-sm text-muted-foreground">
                                    Last verified {formatRelativeTime(status.lastVerifiedAt)}
                                </p>
                            )}
                            <Button
                                variant="outline"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => disconnectMutation.mutate()}
                                disabled={disconnectMutation.isPending}
                            >
                                {disconnectMutation.isPending ? (
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                    <Trash2 className="mr-2 size-4" />
                                )}
                                Disconnect bucket
                            </Button>
                        </CardContent>
                    )}
                </Card>

                <Card className="border-border/80 shadow-sm">
                    <CardHeader>
                        <CardTitle>{status?.configured ? "Replace connected bucket" : "Connect a bucket"}</CardTitle>
                        <CardDescription>
                            Test the connection before saving — a broken credential is never stored.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Provider</Label>
                                <Select
                                    value={provider}
                                    onValueChange={(value) => {
                                        setProvider(value as BackupStorageProvider);
                                        invalidatePriorTest();
                                    }}
                                >
                                    <SelectTrigger className="h-9 border-border/60 bg-background">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {providerOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bucket">Bucket name</Label>
                                <Input
                                    id="bucket"
                                    value={bucket}
                                    onChange={(event) => {
                                        setBucket(event.target.value);
                                        invalidatePriorTest();
                                    }}
                                    placeholder="my-opslin-backups"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            {providerMeta.needsEndpoint ? (
                                <div className="space-y-2">
                                    <Label htmlFor="endpoint">Endpoint URL</Label>
                                    <Input
                                        id="endpoint"
                                        value={endpoint}
                                        onChange={(event) => {
                                            setEndpoint(event.target.value);
                                            invalidatePriorTest();
                                        }}
                                        placeholder={
                                            provider === "cloudflare_r2"
                                                ? "https://<account-id>.r2.cloudflarestorage.com"
                                                : "https://your-storage-host:9000"
                                        }
                                    />
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Label htmlFor="region">Region</Label>
                                    <Input
                                        id="region"
                                        value={region}
                                        onChange={(event) => {
                                            setRegion(event.target.value);
                                            invalidatePriorTest();
                                        }}
                                        placeholder="ap-south-1"
                                    />
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="accessKeyId">Access key ID</Label>
                                <Input
                                    id="accessKeyId"
                                    value={accessKeyId}
                                    onChange={(event) => {
                                        setAccessKeyId(event.target.value);
                                        invalidatePriorTest();
                                    }}
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="secretAccessKey">Secret access key</Label>
                            <Input
                                id="secretAccessKey"
                                type="password"
                                value={secretAccessKey}
                                onChange={(event) => {
                                    setSecretAccessKey(event.target.value);
                                    invalidatePriorTest();
                                }}
                                autoComplete="off"
                            />
                        </div>

                        {testResult && (
                            <div
                                className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
                                    testResult.success
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                        : "border-destructive/30 bg-destructive/10 text-destructive"
                                }`}
                            >
                                {testResult.success ? (
                                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                                ) : (
                                    <XCircle className="mt-0.5 size-4 shrink-0" />
                                )}
                                <span>{testResult.message}</span>
                            </div>
                        )}

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button
                                variant="outline"
                                onClick={() => testMutation.mutate()}
                                disabled={!canSubmit || testMutation.isPending}
                                className="w-full sm:w-fit"
                            >
                                {testMutation.isPending ? (
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                    <ShieldAlert className="mr-2 size-4" />
                                )}
                                Test connection
                            </Button>
                            <Button
                                onClick={() => saveMutation.mutate()}
                                disabled={!canSubmit || !testResult?.success || saveMutation.isPending}
                                className="w-full sm:w-fit"
                            >
                                {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                Save
                            </Button>
                        </div>
                        {canSubmit && !testResult?.success && (
                            <p className="text-xs text-muted-foreground">
                                Run a successful test first — Opslin never saves an unverified credential.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
