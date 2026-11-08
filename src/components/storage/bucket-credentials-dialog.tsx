"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiRequestError, type CloudflareR2BucketRecord } from "@/lib/api";

const FIELDS = [
    { suffix: "ACCESS_KEY_ID", label: "Access key ID", secret: false },
    { suffix: "SECRET_ACCESS_KEY", label: "Secret access key", secret: true },
    { suffix: "ENDPOINT", label: "Endpoint", secret: false },
    { suffix: "BUCKET", label: "Bucket", secret: false },
] as const;

const PREFIX = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

async function copy(text: string, what: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${what} copied`);
    } catch {
        toast.error("Couldn't copy. Select the text and copy it by hand.");
    }
}

/**
 * The four values every project needs to use a bucket (the ones Cloudflare shows once and Opslin otherwise only pushes
 * into an app). Owners and admins only; the API checks that, the Cloudflare sign-in, and audits every view. The secret
 * is never kept in the query cache after the window closes (gcTime 0) and stays hidden until asked for.
 */
export function BucketCredentialsDialog({ bucket, onClose }: { bucket: CloudflareR2BucketRecord | null; onClose: () => void }) {
    const [prefix, setPrefix] = useState("R2");
    const [showSecret, setShowSecret] = useState(false);
    const [copied, setCopied] = useState(false);

    const credentials = useQuery({
        queryKey: ["r2BucketCredentials", bucket?.id],
        queryFn: () => api.revealR2BucketCredentials(bucket!.id),
        enabled: Boolean(bucket),
        gcTime: 0,
        staleTime: 0,
        retry: false,
        refetchOnWindowFocus: false,
    });

    const validPrefix = PREFIX.test(prefix);
    const rows = useMemo(() => {
        const variables = credentials.data?.variables ?? {};
        return FIELDS.map((field) => ({
            ...field,
            name: `${validPrefix ? prefix : "R2"}_${field.suffix}`,
            value: variables[`R2_${field.suffix}`] ?? "",
        }));
    }, [credentials.data, prefix, validPrefix]);

    const envText = rows.map((row) => `${row.name}=${row.value}`).join("\n");
    const denied = credentials.error instanceof ApiRequestError && credentials.error.status === 403;

    function close() {
        setShowSecret(false);
        setCopied(false);
        onClose();
    }

    return (
        <Dialog open={Boolean(bucket)} onOpenChange={(open) => (open ? undefined : close())}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Connection details</DialogTitle>
                    <DialogDescription>
                        Bucket <span className="font-mono text-foreground">{bucket?.bucketName}</span>. Add these to any project that should use it, and keep the secret private.
                    </DialogDescription>
                </DialogHeader>

                {credentials.isLoading ? (
                    <div className="flex items-center justify-center py-10" role="status" aria-label="Loading connection details">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : credentials.isError ? (
                    <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="alert">
                        {denied ? "Only owners and admins can see bucket keys, and Cloudflare must be signed in." : "Couldn't load the details. Try again."}
                    </p>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="credentialPrefix">Name prefix</Label>
                            <Input
                                id="credentialPrefix"
                                value={prefix}
                                onChange={(event) => setPrefix(event.target.value.toUpperCase())}
                                aria-invalid={!validPrefix}
                                className="font-mono"
                            />
                            <p className="text-xs text-muted-foreground">
                                {validPrefix ? "Change it if your project uses other names, for example S3 or STORAGE." : "Use letters, numbers and underscores, starting with a letter."}
                            </p>
                        </div>

                        <ul className="space-y-3">
                            {rows.map((row) => (
                                <li key={row.suffix}>
                                    <div className="mb-1.5 flex items-center justify-between gap-2">
                                        <span className="font-mono text-xs font-medium text-muted-foreground">{row.name}</span>
                                        <span className="flex shrink-0 items-center gap-1">
                                            {row.secret ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                                                    aria-label={showSecret ? "Hide secret access key" : "Show secret access key"}
                                                    onClick={() => setShowSecret((value) => !value)}
                                                >
                                                    {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                                    {showSecret ? "Hide" : "Show"}
                                                </Button>
                                            ) : null}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                                                aria-label={`Copy ${row.label}`}
                                                onClick={() => void copy(row.value, row.label)}
                                            >
                                                <Copy className="size-3.5" />
                                                Copy
                                            </Button>
                                        </span>
                                    </div>
                                    <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
                                        {row.secret && !showSecret ? "•".repeat(32) : row.value}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={close}>Close</Button>
                    <Button
                        disabled={!credentials.data || !validPrefix}
                        onClick={async () => {
                            await copy(envText, "All four values");
                            setCopied(true);
                        }}
                    >
                        {copied ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
                        Copy as .env
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
