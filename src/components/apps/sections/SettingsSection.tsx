"use client";

import Link from "next/link";
import { Copy, ExternalLink, FileCode2, Globe, Loader2, RotateCcw, Save, ShieldCheck, Info, Settings, HeartPulse, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { DeleteAppAction } from "@/components/apps/DeleteAppAction";
import { DeleteLifecycleNotice } from "@/components/apps/DeleteLifecycleNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { App, BuildpackName, HealthCheckMode, Server } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { BuildpackVersionSelector } from "@/components/apps/BuildpackVersionSelector";

type SettingsSectionProps = {
    app: App;
    server: Pick<Server, "id" | "name">;
    buildpackOverride: BuildpackName | "";
    onBuildpackOverrideChange: (value: BuildpackName | "") => void;
    healthCheckMode: HealthCheckMode;
    onHealthCheckModeChange: (value: HealthCheckMode) => void;
    healthPath: string;
    onHealthPathChange: (value: string) => void;
    registryHost: string;
    onRegistryHostChange: (value: string) => void;
    registryUsername: string;
    onRegistryUsernameChange: (value: string) => void;
    registryPassword: string;
    onRegistryPasswordChange: (value: string) => void;
    publicStatus: boolean;
    onPublicStatusChange: (value: boolean) => void;
    deleteFailureReason?: string | null;
    deleteLocked: boolean;
    deletePending: boolean;
    buildConfigPending: boolean;
    healthSettingsPending: boolean;
    publicStatusPending: boolean;
    registryTestPending: boolean;
    registryTestResult?: { ok: boolean; registry: string } | null;
    registryTestError?: unknown;
    buildConfigError?: unknown;
    healthSettingsError?: unknown;
    publicStatusError?: unknown;
    onSaveBuildConfig: () => void;
    onSaveHealthSettings: () => void;
    onTestRegistry: () => void;
    onSavePublicStatus: () => void;
    onDelete: () => void;
    onRetryDeleteCleanup: () => void;
};

const buildpackOptions: Array<{ value: BuildpackName | ""; label: string }> = [
    { value: "", label: "Auto-detect" },
    { value: "node", label: "Node.js / React / Vite / Next.js / Angular" },
    { value: "python", label: "Python" },
    { value: "go", label: "Go" },
    { value: "php", label: "PHP" },
    { value: "ruby", label: "Ruby" },
    { value: "java", label: "Java" },
    { value: "rust", label: "Rust" },
    { value: "static", label: "Static Site" },
];
const frontendFrameworkChips = ["React / Vite", "CRA", "Angular", "Next.js", "Vue / Nuxt", "SvelteKit"];

function safeErrorMessage(error: unknown, fallback: string) {
    return error ? fallback : null;
}

function healthModeLabel(mode?: HealthCheckMode | null, recommended = false) {
    if (mode === "strict_http") {
        return "Strict HTTP";
    }
    if (mode === "port") {
        return "Port readiness";
    }
    return recommended ? "Auto (recommended)" : "Auto";
}

export function SettingsSection({
    app,
    server,
    buildpackOverride,
    onBuildpackOverrideChange,
    healthCheckMode,
    onHealthCheckModeChange,
    healthPath,
    onHealthPathChange,
    registryHost,
    onRegistryHostChange,
    registryUsername,
    onRegistryUsernameChange,
    registryPassword,
    onRegistryPasswordChange,
    publicStatus,
    onPublicStatusChange,
    deleteFailureReason,
    deleteLocked,
    deletePending,
    buildConfigPending,
    healthSettingsPending,
    publicStatusPending,
    registryTestPending,
    registryTestResult,
    registryTestError,
    buildConfigError,
    healthSettingsError,
    publicStatusError,
    onSaveBuildConfig,
    onSaveHealthSettings,
    onTestRegistry,
    onSavePublicStatus,
    onDelete,
    onRetryDeleteCleanup,
}: SettingsSectionProps) {
    const isDeleting = app.status === "deleting";
    const isDeleteFailed = app.status === "delete_failed";
    const statusUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/status/${encodeURIComponent(app.id)}`;

    const copyAppId = async () => {
        await navigator.clipboard.writeText(app.id);
        toast.success("App ID copied", { duration: 2000 });
    };

    return (
        <section className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-muted border border-border shrink-0">
                            <Info size={20} />
                        </div>
                        <div>
                            <CardTitle className="text-lg">App Info</CardTitle>
                            <CardDescription>Identifiers and source details for support and audit trails.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-border/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">App ID</p>
                        <div className="mt-2 flex items-center gap-2">
                            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-sm">{app.id}</code>
                            <Button type="button" variant="outline" size="sm" onClick={copyAppId} aria-label="Copy App ID">
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="rounded-lg border border-border/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Server</p>
                        <Button asChild variant="link" className="mt-1 h-auto p-0 text-sm">
                            <Link href={`/servers/${server.id}`}>{server.name}</Link>
                        </Button>
                    </div>
                    <div className="rounded-lg border border-border/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Repository</p>
                        {app.gitUrl ? (
                            <a
                                href={app.gitUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 block truncate text-sm font-medium text-info-text hover:underline"
                            >
                                {app.gitUrl}
                            </a>
                        ) : (
                            <p className="mt-2 text-sm text-muted-foreground">No repository linked.</p>
                        )}
                    </div>
                    <div className="rounded-lg border border-border/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Branch / Created</p>
                        <p className="mt-2 text-sm font-medium text-foreground">{app.branch || "main"}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{formatRelativeTime(app.createdAt)}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Health mode</p>
                        <p className="mt-2 text-sm font-medium text-foreground">{healthModeLabel(app.healthCheckMode)}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Health path</p>
                        <p className="mt-2 text-sm font-medium text-foreground">{app.healthPath || "/"}</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-muted border border-border shrink-0">
                            <Settings size={20} />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Build Configuration</CardTitle>
                            <CardDescription>
                                App-level buildpack, registry, Dockerfile, and Nginx override controls.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {deleteLocked ? (
                        <div className="rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning-text">
                            Settings changes are paused while cleanup is pending.
                        </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-3">
                        <div>
                            <Label htmlFor="buildpackOverride">Buildpack Override</Label>
                            <select
                                id="buildpackOverride"
                                value={buildpackOverride}
                                onChange={(event) => onBuildpackOverrideChange(event.target.value as BuildpackName | "")}
                                disabled={deleteLocked}
                                className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                            >
                                {buildpackOptions.map((option) => (
                                    <option key={option.value || "auto"} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-2 text-xs text-muted-foreground">
                                Frontend framework options use the Node.js buildpack with framework-specific output detection.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2" aria-label="Supported frontend frameworks">
                                {frontendFrameworkChips.map((label) => (
                                    <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                        <FileCode2 className="h-3.5 w-3.5" />
                                        {label}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-end">
                            <Button asChild variant="outline" className="w-full">
                                <Link href={`/apps/${app.id}/dockerfile`}>
                                    <FileCode2 className="mr-2 h-4 w-4" />
                                    Edit Dockerfile Override
                                </Link>
                            </Button>
                        </div>
                        <div className="flex items-end">
                            <Button asChild variant="outline" className="w-full">
                                <Link href={`/apps/${app.id}/nginx`}>
                                    <Globe className="mr-2 h-4 w-4" />
                                    Edit Nginx Engine
                                </Link>
                            </Button>
                        </div>
                    </div>

                    <BuildpackVersionSelector
                        serverId={server.id}
                        appId={app.id}
                        buildpackVersion={app.buildpackVersion ?? null}
                        buildpackVersionPin={app.buildpackVersionPin ?? null}
                        disabled={deleteLocked}
                    />

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="md:col-span-3">
                            <Label htmlFor="registryHost">Registry Host</Label>
                            <Input
                                id="registryHost"
                                value={registryHost}
                                onChange={(event) => onRegistryHostChange(event.target.value)}
                                placeholder="ghcr.io"
                                disabled={deleteLocked}
                            />
                        </div>
                        <div>
                            <Label htmlFor="registryUsername">Username</Label>
                            <Input
                                id="registryUsername"
                                value={registryUsername}
                                onChange={(event) => onRegistryUsernameChange(event.target.value)}
                                placeholder="octocat"
                                disabled={deleteLocked}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="registryPassword">Password / Token</Label>
                            <Input
                                id="registryPassword"
                                type="password"
                                value={registryPassword}
                                onChange={(event) => onRegistryPasswordChange(event.target.value)}
                                placeholder={app.registryCredentials?.hasPassword ? "Leave blank to keep current secret" : "Registry token"}
                                disabled={deleteLocked}
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant="outline"
                            onClick={onTestRegistry}
                            disabled={registryTestPending || deleteLocked}
                        >
                            {registryTestPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <ShieldCheck className="mr-2 h-4 w-4" />
                            )}
                            {registryTestPending ? "Testing" : "Test Connection"}
                        </Button>
                        <Button
                            onClick={onSaveBuildConfig}
                            disabled={buildConfigPending || deleteLocked}
                        >
                            {buildConfigPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            {buildConfigPending ? "Saving" : "Save Build Config"}
                        </Button>
                    </div>

                    {registryTestResult ? (
                        <div className="rounded-lg bg-success-muted px-4 py-3 text-sm text-success-text">
                            Registry authentication succeeded for {registryTestResult.registry}.
                        </div>
                    ) : null}
                    {safeErrorMessage(registryTestError, "Registry authentication failed. Check the host, username, and token.") ? (
                        <div className="rounded-lg bg-danger-muted px-4 py-3 text-sm text-danger-text">
                            Registry authentication failed. Check the host, username, and token.
                        </div>
                    ) : null}
                    {safeErrorMessage(buildConfigError, "Build configuration could not be saved.") ? (
                        <div className="rounded-lg bg-danger-muted px-4 py-3 text-sm text-danger-text">
                            Build configuration could not be saved.
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-muted border border-border shrink-0">
                            <HeartPulse size={20} />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Health Check Settings</CardTitle>
                            <CardDescription>
                                Configure readiness checks as Opslin deployment settings.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-5">
                    {deleteLocked ? (
                        <div className="rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning-text">
                            Health check changes are paused while cleanup is pending.
                        </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <Label htmlFor="settingsHealthCheckMode">Health check mode</Label>
                            <select
                                id="settingsHealthCheckMode"
                                data-testid="settings-health-check-mode"
                                value={healthCheckMode}
                                onChange={(event) => onHealthCheckModeChange(event.target.value as HealthCheckMode)}
                                disabled={deleteLocked}
                                className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                            >
                                <option value="auto">Auto (recommended)</option>
                                <option value="strict_http">Strict HTTP</option>
                                <option value="port">Port readiness</option>
                            </select>
                            <p className="mt-2 text-xs text-muted-foreground">
                                Auto works best for backend APIs without a /health route.
                                Strict HTTP requires HTTP 200 on the configured path.
                                Port readiness checks only that the app port is reachable.
                            </p>
                        </div>

                        <div>
                            <Label htmlFor="settingsHealthPath">Health check path</Label>
                            <Input
                                id="settingsHealthPath"
                                data-testid="settings-health-check-path"
                                value={healthPath}
                                onChange={(event) => onHealthPathChange(event.target.value)}
                                placeholder="/health"
                                disabled={deleteLocked}
                            />
                            <p className="mt-2 text-xs text-muted-foreground">
                                Optional. Use /health or /api/health if your app has one.
                                This is a Opslin deployment setting, not an environment variable.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            onClick={onSaveHealthSettings}
                            disabled={healthSettingsPending || deleteLocked}
                        >
                            {healthSettingsPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            {healthSettingsPending ? "Saving" : "Save Health Settings"}
                        </Button>
                    </div>

                    {safeErrorMessage(healthSettingsError, "Health check settings could not be saved.") ? (
                        <div className="rounded-lg bg-danger-muted px-4 py-3 text-sm text-danger-text">
                            Health check settings could not be saved.
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-muted border border-border shrink-0">
                            <Globe size={20} />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Public Status Page</CardTitle>
                            <CardDescription>
                                Share read-only app health without exposing logs, secrets, or runtime controls.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div className="space-y-2">
                            <Label htmlFor="publicStatus">Expose public status page</Label>
                            <select
                                id="publicStatus"
                                value={publicStatus ? "enabled" : "disabled"}
                                onChange={(event) => onPublicStatusChange(event.target.value === "enabled")}
                                disabled={deleteLocked}
                                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm md:w-64"
                            >
                                <option value="disabled">Disabled</option>
                                <option value="enabled">Enabled</option>
                            </select>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                variant="outline"
                                onClick={onSavePublicStatus}
                                disabled={publicStatusPending || deleteLocked}
                            >
                                {publicStatusPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                {publicStatusPending ? "Saving" : "Save Status Setting"}
                            </Button>
                            {publicStatus ? (
                                <Button asChild>
                                    <a href={statusUrl} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Open Public Status
                                    </a>
                                </Button>
                            ) : null}
                        </div>
                    </div>
                    {publicStatusError ? (
                        <div className="rounded-lg bg-danger-muted px-4 py-3 text-sm text-danger-text">
                            Public status setting could not be saved.
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <Card className="border-danger/30">
                <CardHeader>
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger-muted border border-border shrink-0">
                            <ShieldAlert size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-lg text-danger-text">Danger Zone</CardTitle>
                                {isDeleting ? <Badge className="bg-warning-muted text-warning-text">DELETING</Badge> : null}
                                {isDeleteFailed ? <Badge className="bg-danger-muted text-danger-text">DELETE FAILED</Badge> : null}
                            </div>
                            <CardDescription>
                                Delete cleanup runs on the server first. The app stays visible until cleanup succeeds.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {(isDeleting || isDeleteFailed) ? (
                        <DeleteLifecycleNotice
                            status={app.status}
                            errorReason={deleteFailureReason}
                            onRetry={isDeleteFailed ? onRetryDeleteCleanup : undefined}
                            retryPending={deletePending}
                        />
                    ) : null}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-muted-foreground">
                            <p className="font-medium text-foreground">Delete App</p>
                            <p>This stops runtime resources, removes Opslin-managed routes, and deletes the app record after cleanup succeeds.</p>
                        </div>
                        {isDeleteFailed ? (
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={onRetryDeleteCleanup}
                                disabled={deletePending}
                                className="shrink-0"
                            >
                                {deletePending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                )}
                                Retry cleanup
                            </Button>
                        ) : (
                            <DeleteAppAction
                                appName={app.name}
                                onConfirm={onDelete}
                                pending={deletePending}
                                disabled={deleteLocked}
                                className="shrink-0"
                            />
                        )}
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
