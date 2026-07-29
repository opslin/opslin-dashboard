"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

const defaultScopes = ["apps:read", "apps.deploy:write"];

export function ApiKeyManager() {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [selectedScopes, setSelectedScopes] = useState<string[]>(defaultScopes);
    const [newKey, setNewKey] = useState<string | null>(null);

    const { data, isLoading, isError } = useQuery({
        queryKey: ["apiKeys"],
        queryFn: () => api.getApiKeys(),
    });

    const availableScopes = useMemo(
        () => data?.availableScopes.filter((scope) => scope !== "*") ?? [],
        [data?.availableScopes]
    );

    const createMutation = useMutation({
        mutationFn: () => api.createApiKey({
            name: name.trim(),
            scopes: selectedScopes,
        }),
        onSuccess: (result) => {
            setNewKey(result.key);
            setName("");
            setSelectedScopes(defaultScopes);
            queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
            toast.success("API key created");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to create API key");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.deleteApiKey(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
            toast.success("API key deleted");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to delete API key");
        },
    });

    const toggleScope = (scope: string) => {
        setSelectedScopes((current) =>
            current.includes(scope)
                ? current.filter((item) => item !== scope)
                : [...current, scope]
        );
    };

    const copyNewKey = async () => {
        if (!newKey) {
            return;
        }
        await navigator.clipboard.writeText(newKey);
        toast.success("API key copied");
    };

    return (
        <Card data-testid="api-key-manager" className="border-border/80 shadow-sm">
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <KeyRound className="size-5" />
                        </div>
                        <div>
                            <CardTitle>API Keys</CardTitle>
                            <CardDescription>
                                Create scoped keys for CI/CD integrations. The full key is shown only once.
                            </CardDescription>
                        </div>
                    </div>
                    {data ? (
                        <Badge variant="secondary">{data.apiKeys.length} active</Badge>
                    ) : null}
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                {newKey && (
                    <div className="rounded-xl border border-success/30 bg-success-muted p-4">
                        <div className="flex flex-col gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-success-text">Copy this key now</p>
                                <code className="mt-2 block break-all rounded-lg border border-success/20 bg-background px-3 py-2 font-mono text-xs text-foreground">
                                    {newKey}
                                </code>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={copyNewKey} className="w-full sm:w-fit">
                                <Copy className="mr-2 h-4 w-4" />
                                Copy
                            </Button>
                        </div>
                    </div>
                )}

                <div className="grid gap-4 rounded-xl border border-border/70 bg-secondary/20 p-4">
                    <div>
                        <p className="text-sm font-medium text-foreground">Create deploy key</p>
                        <p className="text-sm text-muted-foreground">Use the narrowest scopes your automation needs.</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="apiKeyName">Name</Label>
                        <Input
                            id="apiKeyName"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="GitHub Actions deploy key"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Scopes</Label>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {availableScopes.map((scope) => (
                                <label
                                    key={scope}
                                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm transition-colors hover:bg-background"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedScopes.includes(scope)}
                                        onChange={() => toggleScope(scope)}
                                        className="h-4 w-4 rounded border-border"
                                    />
                                    <span className="font-mono text-xs">{scope}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <Button
                        type="button"
                        onClick={() => createMutation.mutate()}
                        disabled={createMutation.isPending || name.trim().length === 0 || selectedScopes.length === 0}
                        className="w-full sm:w-fit"
                        data-testid="create-api-key-button"
                    >
                        {createMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Plus className="mr-2 h-4 w-4" />
                        )}
                        Create API Key
                    </Button>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-medium">Active keys</p>
                        </div>
                        <Badge variant="outline" className="bg-background">
                            Scoped access
                        </Badge>
                    </div>

                    {isLoading && (
                        <div className="space-y-2" data-testid="api-key-skeleton">
                            <div className="h-16 animate-pulse rounded-lg bg-muted" />
                            <div className="h-16 animate-pulse rounded-lg bg-muted" />
                        </div>
                    )}

                    {isError && (
                        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            Unable to load API keys.
                        </p>
                    )}

                    {!isLoading && !isError && data?.apiKeys.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border bg-secondary/20 px-3 py-8 text-center">
                            <KeyRound className="mx-auto size-5 text-muted-foreground" />
                            <p className="mt-2 text-sm font-medium text-foreground">No API keys created yet.</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Create one when you connect CI or external automation.
                            </p>
                        </div>
                    )}

                    {data?.apiKeys.map((apiKey) => (
                        <div
                            key={apiKey.id}
                            className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
                        >
                            <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-medium">{apiKey.name}</p>
                                    <Badge variant="secondary" className="font-mono">{apiKey.prefix}...</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Created {formatRelativeTime(apiKey.createdAt)}
                                    {apiKey.lastUsedAt ? ` · last used ${formatRelativeTime(apiKey.lastUsedAt)}` : " · never used"}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                    {apiKey.scopes.map((scope) => (
                                        <Badge key={scope} variant="outline" className="font-mono text-[10px]">
                                            {scope}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => deleteMutation.mutate(apiKey.id)}
                                disabled={deleteMutation.isPending}
                                className="w-full text-destructive hover:text-destructive sm:w-fit"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </Button>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
