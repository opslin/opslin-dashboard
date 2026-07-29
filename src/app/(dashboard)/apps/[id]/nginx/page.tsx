"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Globe, Loader2, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlanGate } from "@/components/PlanGate";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { api } from "@/lib/api";

const NginxMonaco = dynamic(
    () => import("@/components/apps/nginx-monaco").then((mod) => mod.NginxMonaco),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-[40vh] min-h-[320px] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
                Loading editor...
            </div>
        ),
    }
);

type ProxyFormState = {
    path: string;
    upstreamUrl: string;
    preserveHost: boolean;
    stripPrefix: boolean;
    timeoutMs: string;
    forwardCookies: boolean;
};

const emptyProxyState: ProxyFormState = {
    path: "/proxy",
    upstreamUrl: "https://httpbin.org/anything",
    preserveHost: false,
    stripPrefix: false,
    timeoutMs: "60000",
    forwardCookies: false,
};

export default function NginxConfigPage() {
    const params = useParams();
    const queryClient = useQueryClient();
    const appId = params.id as string;
    const [userSnippetDraft, setUserSnippetDraft] = useState<string | null>(null);
    const [validationMessage, setValidationMessage] = useState<string | null>(null);
    const [proxyForm, setProxyForm] = useState<ProxyFormState>(emptyProxyState);

    const nginxQuery = useQuery({
        queryKey: ["appNginx", appId],
        queryFn: () => api.getNginxConfig(appId),
    });

    const userSnippet = userSnippetDraft ?? nginxQuery.data?.userSnippet ?? "";

    const validateMutation = useMutation({
        mutationFn: () => api.validateNginxConfig(appId, userSnippet),
        onSuccess: (data) => {
            setValidationMessage(`Validation passed. ${data.fullConfig.split("\n").length} lines assembled.`);
        },
        onError: (error) => {
            setValidationMessage((error as Error).message);
        },
    });

    const saveMutation = useMutation({
        mutationFn: () => api.saveNginxConfig(appId, userSnippet),
        onSuccess: () => {
            setValidationMessage("Nginx config saved and reloaded.");
            queryClient.invalidateQueries({ queryKey: ["appNginx", appId] });
        },
        onError: (error) => {
            setValidationMessage((error as Error).message);
        },
    });

    const createProxyMutation = useMutation({
        mutationFn: () => api.createProxy(appId, {
            path: proxyForm.path,
            upstreamUrl: proxyForm.upstreamUrl,
            preserveHost: proxyForm.preserveHost,
            stripPrefix: proxyForm.stripPrefix,
            timeoutMs: Number(proxyForm.timeoutMs) || 60000,
            forwardCookies: proxyForm.forwardCookies,
        }),
        onSuccess: () => {
            setProxyForm(emptyProxyState);
            queryClient.invalidateQueries({ queryKey: ["appNginx", appId] });
        },
    });

    const rollbackMutation = useMutation({
        mutationFn: (version: number) => api.rollbackNginxConfig(appId, version),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["appNginx", appId] });
        },
    });

    const deleteProxyMutation = useMutation({
        mutationFn: (proxyId: string) => api.deleteProxy(appId, proxyId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["appNginx", appId] });
        },
    });

    const isDirty = useMemo(
        () => userSnippet !== (nginxQuery.data?.userSnippet || ""),
        [nginxQuery.data?.userSnippet, userSnippet]
    );

    if (nginxQuery.isLoading) {
        return (
            <>
                <Header title="Nginx Configuration" description="Loading app configuration" />
                <div className="p-6">
                    <div className="h-[50vh] animate-pulse rounded-xl bg-muted" />
                </div>
            </>
        );
    }

    const data = nginxQuery.data;
    if (!data) {
        return (
            <>
                <Header title="Nginx Configuration" description="Application not found" />
                <div className="p-6">
                    <Card className="mx-auto max-w-xl">
                        <CardContent className="pt-6 text-center">
                            <p className="text-muted-foreground">This application could not be found.</p>
                            <Button asChild className="mt-4">
                                <Link href="/apps">Back to Apps</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </>
        );
    }

    return (
        <>
            <Header
                title="Nginx Engine"
                description="Validate, save, diff, and rollback the app-level Nginx snippet and URL proxies."
                actions={
                    <PlanGate
                        feature="server.nginxConfig"
                        fallback={<UpgradePrompt feature="server.nginxConfig" compact />}
                    >
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => validateMutation.mutate()}
                                disabled={validateMutation.isPending}
                            >
                                {validateMutation.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Validating
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        Validate
                                    </>
                                )}
                            </Button>
                            <Button
                                onClick={() => saveMutation.mutate()}
                                disabled={saveMutation.isPending}
                            >
                                {saveMutation.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        {isDirty ? "Save + Reload" : "Apply + Reload"}
                                    </>
                                )}
                            </Button>
                        </div>
                    </PlanGate>
                }
            />

            <div className="space-y-6 p-6">
                <Button variant="ghost" asChild>
                    <Link href={`/apps/${appId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to App
                    </Link>
                </Button>

                <PlanGate feature="server.nginxConfig">
                    <Card elevation="raised">
                        <CardHeader>
                            <h2 className="flex items-center gap-2 text-lg font-semibold leading-none">
                                <Globe className="h-5 w-5 text-muted-foreground" />
                                Editable Snippet
                            </h2>
                            <CardDescription>
                                Saved between {`#### USER_CONFIG_START ####`} and {`#### USER_CONFIG_END ####`}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <NginxMonaco value={userSnippet} onChange={setUserSnippetDraft} />
                            {validationMessage && (
                                <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm text-foreground">
                                    {validationMessage}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </PlanGate>

                <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                    <Card>
                        <CardHeader>
                            <h2 className="text-lg font-semibold leading-none">Assembled Config</h2>
                            <CardDescription>
                                Current full config for {data.domain || "the default host"}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <pre className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-inverse p-4 text-xs text-text-on-inverse-muted">
                                {data.fullConfig || "# No config assembled yet"}
                            </pre>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <h2 className="text-lg font-semibold leading-none">Latest Diff</h2>
                            <CardDescription>
                                Most recent stored diff against the previous saved version.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <pre className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-muted/40 p-4 text-xs text-foreground">
                                {data.diff || "# No diff saved yet"}
                            </pre>
                        </CardContent>
                    </Card>
                </div>

                <PlanGate feature="server.nginxConfig" fallback={null}>
                    <Card>
                        <CardHeader>
                            <h2 className="text-lg font-semibold leading-none">URL Proxies</h2>
                            <CardDescription>
                                SSRF-safe, pinned-IP reverse proxies mounted under this app domain.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <Label htmlFor="proxyPath">Path</Label>
                                <Input
                                    id="proxyPath"
                                    value={proxyForm.path}
                                    onChange={(event) => setProxyForm((current) => ({ ...current, path: event.target.value }))}
                                />
                            </div>
                            <div>
                                <Label htmlFor="proxyUrl">Upstream URL</Label>
                                <Input
                                    id="proxyUrl"
                                    value={proxyForm.upstreamUrl}
                                    onChange={(event) => setProxyForm((current) => ({ ...current, upstreamUrl: event.target.value }))}
                                />
                            </div>
                            <div>
                                <Label htmlFor="timeoutMs">Timeout (ms)</Label>
                                <Input
                                    id="timeoutMs"
                                    value={proxyForm.timeoutMs}
                                    onChange={(event) => setProxyForm((current) => ({ ...current, timeoutMs: event.target.value }))}
                                />
                            </div>
                            <div className="flex flex-wrap items-end gap-4">
                                <label className="flex items-center gap-2 text-sm text-foreground">
                                    <input
                                        type="checkbox"
                                        checked={proxyForm.preserveHost}
                                        onChange={(event) => setProxyForm((current) => ({ ...current, preserveHost: event.target.checked }))}
                                    />
                                    Preserve Host
                                </label>
                                <label className="flex items-center gap-2 text-sm text-foreground">
                                    <input
                                        type="checkbox"
                                        checked={proxyForm.stripPrefix}
                                        onChange={(event) => setProxyForm((current) => ({ ...current, stripPrefix: event.target.checked }))}
                                    />
                                    Strip Prefix
                                </label>
                                <label className="flex items-center gap-2 text-sm text-foreground">
                                    <input
                                        type="checkbox"
                                        checked={proxyForm.forwardCookies}
                                        onChange={(event) => setProxyForm((current) => ({ ...current, forwardCookies: event.target.checked }))}
                                    />
                                    Forward Cookies
                                </label>
                            </div>
                        </div>

                        <Button onClick={() => createProxyMutation.mutate()} disabled={createProxyMutation.isPending}>
                            {createProxyMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Adding Proxy
                                </>
                            ) : (
                                "Add Proxy"
                            )}
                        </Button>

                        {createProxyMutation.error && (
                            <div className="rounded-lg bg-danger-muted px-4 py-3 text-sm text-danger-text">
                                {(createProxyMutation.error as Error).message}
                            </div>
                        )}

                        <div className="space-y-3">
                            {data.proxies.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No proxies configured.</p>
                            ) : data.proxies.map((proxy) => (
                                <div key={proxy.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                                    <div>
                                        <p className="font-medium text-foreground">{proxy.path}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {proxy.upstreamUrl} · {proxy.pinnedIp || "pending"}{proxy.disabledAt ? " · disabled" : ""}
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={() => deleteProxyMutation.mutate(proxy.id)}
                                        disabled={deleteProxyMutation.isPending}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            ))}
                        </div>
                        {deleteProxyMutation.error && (
                            <div className="rounded-lg bg-danger-muted px-4 py-3 text-sm text-danger-text">
                                {(deleteProxyMutation.error as Error).message}
                            </div>
                        )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <h2 className="text-lg font-semibold leading-none">Saved Versions</h2>
                            <CardDescription>
                                Roll back the snippet to any previously saved version.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                        {data.versions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No saved versions yet.</p>
                        ) : data.versions.map((version) => (
                            <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                                <div>
                                    <p className="font-medium text-foreground">Version {version.version}</p>
                                    <p className="text-sm text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</p>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() => rollbackMutation.mutate(version.version)}
                                    disabled={rollbackMutation.isPending}
                                >
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                    Roll Back
                                </Button>
                            </div>
                        ))}
                        </CardContent>
                    </Card>
                </PlanGate>
            </div>
        </>
    );
}
