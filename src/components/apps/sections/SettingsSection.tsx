"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, ExternalLink, FileCode2, Globe, HeartPulse, Layers, Loader2, RotateCcw, Rocket, Save, Settings, ShieldCheck, Trash2, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { DeleteAppAction } from "@/components/apps/DeleteAppAction";
import { DeleteLifecycleNotice } from "@/components/apps/DeleteLifecycleNotice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { App, BuildpackName, HealthCheckMode, ScaleAppResult, Server } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BuildpackVersionSelector } from "@/components/apps/BuildpackVersionSelector";
import { DeployModeSideCards, DeployModeView } from "@/components/apps/sections/DeployModeView";
import type { DeployMode } from "@/components/DeployModeSelector";

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
    scaleTargetReplicaCount: number;
    onScaleTargetReplicaCountChange: (value: number) => void;
    scaleConfirmMultiInstance: boolean;
    onScaleConfirmMultiInstanceChange: (value: boolean) => void;
    scalePending: boolean;
    scaleResult?: ScaleAppResult | null;
    scaleError?: unknown;
    onScaleApp: () => void;
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
    currentDeployMode?: DeployMode;
    deployGateId?: string | null;
    repoFullName?: string;
    onDeployModeChanged?: () => void;
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

function safeErrorMessage(error: unknown, fallback: string) {
    return error ? fallback : null;
}


const NAV = [
    { id: "general", label: "General", icon: Settings },
    { id: "build", label: "Build and run", icon: FileCode2 },
    { id: "health", label: "Health check", icon: HeartPulse },
    { id: "scaling", label: "Scaling", icon: Layers },
    { id: "deploy-mode", label: "Deploy mode", icon: Rocket },
    { id: "status-page", label: "Public status page", icon: Globe },
    { id: "protection", label: "Protection", icon: ShieldCheck, href: "security" },
] as const;

function Section({ id, title, subtitle, action, children }: { id: string; title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <Card id={`settings-${id}`} className="scroll-mt-6 gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-start justify-between gap-3 px-6 pt-5">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                </div>
                {action}
            </div>
            <div className="space-y-5 p-6">{children}</div>
        </Card>
    );
}

function Notice({ tone, children }: { tone: "danger" | "success" | "warning"; children: React.ReactNode }) {
    return (
        <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl px-4 py-3 text-sm", tone === "danger" && "bg-danger-muted text-danger-text", tone === "success" && "bg-success-muted text-success-text", tone === "warning" && "border border-warning/30 bg-warning-muted text-warning-text")}>
            {children}
        </div>
    );
}

function InfoRow({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-4 border-t py-3.5 text-sm first:border-t-0">
            <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{children}</span>
            {action}
        </div>
    );
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
    scaleTargetReplicaCount,
    onScaleTargetReplicaCountChange,
    scaleConfirmMultiInstance,
    onScaleConfirmMultiInstanceChange,
    scalePending,
    scaleResult,
    scaleError,
    onScaleApp,
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
    currentDeployMode = "fast",
    deployGateId,
    repoFullName,
    onDeployModeChanged,
}: SettingsSectionProps) {
    const isDeleting = app.status === "deleting";
    const isDeleteFailed = app.status === "delete_failed";
    const statusUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/status/${encodeURIComponent(app.id)}`;

    const copyAppId = async () => {
        await navigator.clipboard.writeText(app.id);
        toast.success("App ID copied", { duration: 2000 });
    };

    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [active, setActive] = useState<string>("general");
    const goTo = (id: string) => {
        setActive(id);
        if (id === "deploy-mode") return;
        document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const buildErr = safeErrorMessage(buildConfigError, "x");
    const repo = app.gitUrl ? app.gitUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "") : null;
    const frameworkLabel = buildpackOptions.find((o) => o.value === buildpackOverride)?.label ?? "Auto-detect";

    return (
        <section className={cn("grid items-start gap-6", active === "deploy-mode" ? "lg:grid-cols-[220px_minmax(0,1fr)_300px]" : "lg:grid-cols-[220px_minmax(0,1fr)]")}>
            <nav aria-label="Settings sections" className="sticky top-4 rounded-2xl border bg-card p-2 shadow-xs">
                <ul className="space-y-0.5">
                    {NAV.map((item) => {
                        const Icon = item.icon;
                        const cls = cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring", active === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground");
                        return (
                            <li key={item.id}>
                                {"href" in item ? (
                                    <Link href={`/apps/${app.id}?section=${item.href}`} className={cls}><Icon className="size-4" aria-hidden="true" />{item.label}<ChevronRight className="ml-auto size-3.5 opacity-60" aria-hidden="true" /></Link>
                                ) : (
                                    <button type="button" onClick={() => goTo(item.id)} className={cls} aria-current={active === item.id ? "true" : undefined}><Icon className="size-4" aria-hidden="true" />{item.label}</button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                <div className="my-2 border-t" />
                <button type="button" onClick={() => goTo("danger")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-danger-text hover:bg-danger-muted focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="size-4" aria-hidden="true" />Danger zone</button>
            </nav>

            {active === "deploy-mode" ? (
                <>
                    <div className="min-w-0 space-y-5">
                        {deleteLocked ? <Notice tone="warning">Settings changes are paused while the app is being deleted.</Notice> : null}
                        <DeployModeView app={app} currentMode={currentDeployMode} gateId={deployGateId} repoFullName={repoFullName ?? ""} disabled={deleteLocked} onChanged={onDeployModeChanged} />
                    </div>
                    <DeployModeSideCards app={app} healthCheckMode={healthCheckMode} healthPath={healthPath} />
                </>
            ) : (
            <div className="min-w-0 space-y-5">
                {deleteLocked ? <Notice tone="warning">Settings changes are paused while the app is being deleted.</Notice> : null}

                <Section id="general" title="General" subtitle="Basic information about your app.">
                    <div>
                        <InfoRow label="App name">{app.name}</InfoRow>
                        <InfoRow label="App ID" action={<button type="button" onClick={copyAppId} aria-label="Copy App ID" className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><Copy className="size-4" aria-hidden="true" /></button>}><code className="font-mono text-[13px]">{app.id}</code></InfoRow>
                        <InfoRow label="Server" action={<Link href={`/servers/${server.id}`} aria-label={`Open ${server.name}`} className="rounded p-1 text-muted-foreground hover:text-foreground"><ExternalLink className="size-4" aria-hidden="true" /></Link>}><Link href={`/servers/${server.id}`} className="text-primary hover:underline">{server.name}</Link></InfoRow>
                        <InfoRow label="Repository" action={app.gitUrl ? <a href={app.gitUrl.replace(/\.git$/, "")} target="_blank" rel="noopener noreferrer" aria-label="Open repository" className="rounded p-1 text-muted-foreground hover:text-foreground"><ExternalLink className="size-4" aria-hidden="true" /></a> : undefined}>
                            {repo ? <span className="flex items-center gap-1.5 text-primary"><GitBranch className="size-4" aria-hidden="true" />{repo}</span> : <span className="text-muted-foreground">No repository linked</span>}
                        </InfoRow>
                        <InfoRow label="Branch">{app.branch || "main"}</InfoRow>
                    </div>
                </Section>

                <Section id="build" title="Build and run" subtitle="How Opslin builds and starts your app." action={buildpackOverride === "" ? <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Detected automatically</span> : undefined}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="buildpackOverride">Framework</Label>
                            <Select value={buildpackOverride === "" ? "auto" : buildpackOverride} onValueChange={(v) => onBuildpackOverrideChange((v === "auto" ? "" : v) as BuildpackName | "")} disabled={deleteLocked}>
                                <SelectTrigger id="buildpackOverride" aria-label="Framework" className="h-10 w-full"><SelectValue>{frameworkLabel}</SelectValue></SelectTrigger>
                                <SelectContent>
                                    {buildpackOptions.map((o) => (
                                        <SelectItem key={o.value || "auto"} value={o.value === "" ? "auto" : o.value}>{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="appPort">Port</Label>
                            <Input id="appPort" value={app.port ?? "Detected at deploy"} readOnly className="h-10" />
                        </div>
                    </div>

                    <BuildpackVersionSelector serverId={server.id} appId={app.id} buildpackVersion={app.buildpackVersion ?? null} buildpackVersionPin={app.buildpackVersionPin ?? null} disabled={deleteLocked} />

                    <div className="rounded-xl border">
                        <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:ring-2 focus-visible:ring-ring">
                            <Settings className="size-5 text-muted-foreground" aria-hidden="true" />
                            <span className="flex-1">
                                <span className="block text-sm font-semibold text-foreground">Advanced</span>
                                <span className="block text-xs text-muted-foreground">Dockerfile, Nginx, private registry</span>
                            </span>
                            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", advancedOpen && "rotate-180")} aria-hidden="true" />
                        </button>
                        {advancedOpen ? (
                            <div className="space-y-5 border-t p-4">
                                <div className="flex flex-wrap gap-3">
                                    <Button asChild variant="outline"><Link href={`/apps/${app.id}/dockerfile`}><FileCode2 aria-hidden="true" /> Edit Dockerfile override</Link></Button>
                                    <Button asChild variant="outline"><Link href={`/apps/${app.id}/nginx`}><Globe aria-hidden="true" /> Edit Nginx engine</Link></Button>
                                </div>
                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-1.5 md:col-span-3">
                                        <Label htmlFor="registryHost">Registry host</Label>
                                        <Input id="registryHost" value={registryHost} onChange={(e) => onRegistryHostChange(e.target.value)} placeholder="ghcr.io" disabled={deleteLocked} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="registryUsername">Username</Label>
                                        <Input id="registryUsername" value={registryUsername} onChange={(e) => onRegistryUsernameChange(e.target.value)} placeholder="octocat" disabled={deleteLocked} />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label htmlFor="registryPassword">Password / token</Label>
                                        <Input id="registryPassword" type="password" value={registryPassword} onChange={(e) => onRegistryPasswordChange(e.target.value)} placeholder={app.registryCredentials?.hasPassword ? "Leave blank to keep current secret" : "Registry token"} disabled={deleteLocked} />
                                    </div>
                                </div>
                                <Button variant="outline" onClick={onTestRegistry} disabled={registryTestPending || deleteLocked}>
                                    {registryTestPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />} {registryTestPending ? "Testing" : "Test connection"}
                                </Button>
                                {registryTestResult ? <Notice tone="success">Registry sign-in worked for {registryTestResult.registry}.</Notice> : null}
                                {safeErrorMessage(registryTestError, "x") ? <Notice tone="danger">Registry sign-in failed. Check the host, username and token.</Notice> : null}
                            </div>
                        ) : null}
                    </div>

                    {buildErr ? <Notice tone="danger">Build settings could not be saved.</Notice> : null}
                    <div className="flex justify-end">
                        <Button onClick={onSaveBuildConfig} disabled={buildConfigPending || deleteLocked}>
                            {buildConfigPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />} {buildConfigPending ? "Saving" : "Save"}
                        </Button>
                    </div>
                </Section>

                <Section id="health" title="Health check" subtitle="How Opslin knows your app is OK.">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="settingsHealthCheckMode">Mode</Label>
                            <Select value={healthCheckMode} onValueChange={(v) => onHealthCheckModeChange(v as HealthCheckMode)} disabled={deleteLocked}>
                                <SelectTrigger id="settingsHealthCheckMode" data-testid="settings-health-check-mode" aria-label="Health check mode" className="h-10 w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">Auto (recommended)</SelectItem>
                                    <SelectItem value="strict_http">Strict HTTP</SelectItem>
                                    <SelectItem value="port">Port readiness</SelectItem>
                                    <SelectItem value="process">Background worker (no port)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="settingsHealthPath">Path</Label>
                            <Input id="settingsHealthPath" data-testid="settings-health-check-path" value={healthPath} onChange={(e) => onHealthPathChange(e.target.value)} placeholder="/health" disabled={deleteLocked || healthCheckMode === "process"} />
                        </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {healthCheckMode === "process" ? "Background workers have no web address, so Opslin only checks that the container is running." : "Opslin visits this address to see if your app is OK. Auto works for most apps."}
                    </p>
                    {safeErrorMessage(healthSettingsError, "x") ? <Notice tone="danger">Health check settings could not be saved.</Notice> : null}
                    <div className="flex justify-end">
                        <Button onClick={onSaveHealthSettings} disabled={healthSettingsPending || deleteLocked}>
                            {healthSettingsPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />} {healthSettingsPending ? "Saving" : "Save"}
                        </Button>
                    </div>
                </Section>

                <Section id="scaling" title="Scaling" subtitle="Run more than one copy of your app on this server.">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="scaleTargetReplicaCount">Number of instances</Label>
                            <Input id="scaleTargetReplicaCount" type="number" min={1} max={10} value={scaleTargetReplicaCount} onChange={(e) => onScaleTargetReplicaCountChange(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} disabled={deleteLocked || scalePending} />
                            <p className="text-xs text-muted-foreground">Currently running: {app.replicaCount && app.replicaCount > 1 ? `${app.replicaCount} instances` : "1 instance"}.</p>
                        </div>
                        {scaleTargetReplicaCount > 1 ? (
                            <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-muted p-3">
                                <input id="scaleConfirmMultiInstance" type="checkbox" className="mt-0.5 size-4 shrink-0" checked={scaleConfirmMultiInstance} onChange={(e) => onScaleConfirmMultiInstanceChange(e.target.checked)} disabled={deleteLocked || scalePending} />
                                <Label htmlFor="scaleConfirmMultiInstance" className="text-xs font-normal text-warning-text">I confirm this app is safe to run as several copies at once: no shared in-memory sessions and no files it expects to keep on local disk. Opslin cannot check this for you.</Label>
                            </div>
                        ) : null}
                    </div>
                    {scaleResult ? <Notice tone="success">Now running {scaleResult.replicaCount} {scaleResult.replicaCount === 1 ? "instance" : "instances"} on ports {scaleResult.backends.map((b) => b.port).join(", ")}.</Notice> : null}
                    {scaleError ? <Notice tone="danger">{scaleError instanceof Error ? scaleError.message : "Scaling failed."}</Notice> : null}
                    <div className="flex justify-end">
                        <Button onClick={onScaleApp} disabled={scalePending || deleteLocked || (scaleTargetReplicaCount > 1 && !scaleConfirmMultiInstance)}>
                            {scalePending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Layers aria-hidden="true" />} {scalePending ? "Scaling" : "Apply scaling"}
                        </Button>
                    </div>
                </Section>

                <Section id="status-page" title="Public status page" subtitle="Share if your app is up, without sharing logs or secrets.">
                    <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
                        <div>
                            <Label htmlFor="publicStatus" className="text-sm font-semibold">Show a public status page</Label>
                            <p className="text-xs text-muted-foreground">Anyone with the link can see if your app is healthy.</p>
                        </div>
                        <Switch id="publicStatus" checked={publicStatus} onCheckedChange={onPublicStatusChange} disabled={deleteLocked} aria-label="Show a public status page" />
                    </div>
                    {publicStatusError ? <Notice tone="danger">The status page setting could not be saved.</Notice> : null}
                    <div className="flex flex-wrap justify-end gap-3">
                        {publicStatus ? (
                            <Button asChild variant="outline"><a href={statusUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" /> Open status page</a></Button>
                        ) : null}
                        <Button onClick={onSavePublicStatus} disabled={publicStatusPending || deleteLocked}>
                            {publicStatusPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />} {publicStatusPending ? "Saving" : "Save"}
                        </Button>
                    </div>
                </Section>

                <div className="grid gap-5 sm:grid-cols-2">
                    <button type="button" onClick={() => goTo("deploy-mode")} className="flex items-center gap-4 rounded-2xl border bg-card p-5 text-left shadow-xs transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Rocket className="size-5" aria-hidden="true" /></span>
                        <span className="flex-1"><span className="block font-semibold text-foreground">Deploy mode</span><span className="block text-sm text-muted-foreground">How careful before going live</span></span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </button>
                    <Link href={`/apps/${app.id}?section=security`} className="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-xs transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="size-5" aria-hidden="true" /></span>
                        <span className="flex-1"><span className="block font-semibold text-foreground">Protection</span><span className="block text-sm text-muted-foreground">HTTPS and traffic shields</span></span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </Link>
                </div>

                <Card id="settings-danger" className="scroll-mt-6 gap-0 rounded-2xl border-danger/30 bg-danger-muted/20 py-0 shadow-none">
                    <div className="space-y-4 p-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-bold tracking-tight text-danger-text">Danger zone</h2>
                            {isDeleting ? <span className="rounded-full bg-warning-muted px-2.5 py-0.5 text-xs font-medium text-warning-text">Deleting</span> : null}
                            {isDeleteFailed ? <span className="rounded-full bg-danger-muted px-2.5 py-0.5 text-xs font-medium text-danger-text">Delete failed</span> : null}
                        </div>
                        {(isDeleting || isDeleteFailed) ? (
                            <DeleteLifecycleNotice status={app.status} errorReason={deleteFailureReason} onRetry={isDeleteFailed ? onRetryDeleteCleanup : undefined} retryPending={deletePending} />
                        ) : null}
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm text-muted-foreground">
                                <p className="font-semibold text-foreground">Delete app</p>
                                <p>This stops the app, removes its link, and deletes it after clean-up finishes.</p>
                            </div>
                            {isDeleteFailed ? (
                                <Button type="button" variant="destructive" onClick={onRetryDeleteCleanup} disabled={deletePending} className="shrink-0">
                                    {deletePending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />} Retry cleanup
                                </Button>
                            ) : (
                                <DeleteAppAction appName={app.name} onConfirm={onDelete} pending={deletePending} disabled={deleteLocked} className="shrink-0" />
                            )}
                        </div>
                    </div>
                </Card>
            </div>
            )}
        </section>
    );
}
