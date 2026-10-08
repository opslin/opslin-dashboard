"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, HeartPulse, Loader2, Lock, Rocket, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { SafeDeployPermissionModal } from "@/components/SafeDeployPermissionModal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { DeployMode } from "@/components/DeployModeSelector";
import { usePlan } from "@/hooks/usePlan";
import { api, type App, type HealthCheckMode } from "@/lib/api";
import { derivePlanTier, deriveShieldStates, type AppStatus } from "@/lib/security/shield-state";
import { cn } from "@/lib/utils";

type ModeCard = {
    mode: DeployMode;
    title: string;
    description: string;
    plan: "Starter" | "Pro" | null;
    feature?: string;
    icon: typeof Rocket;
};

const MODES: ModeCard[] = [
    { mode: "fast", title: "Fast", description: "Go live as soon as the build is ready. Best for quick changes.", plan: null, icon: Zap },
    { mode: "safe", title: "Safe", description: "Run your tests first. Only go live if they pass.", plan: "Starter", feature: "deploy.safeDeploy", icon: ShieldCheck },
    { mode: "safe_with_health", title: "Safe + health check", description: "Run tests, then check the live app. Go back automatically if it fails.", plan: "Pro", feature: "testing.postDeployHealth", icon: HeartPulse },
];

const HEALTH_LABEL: Record<HealthCheckMode, string> = {
    auto: "Auto (recommended)",
    strict_http: "Strict HTTP",
    port: "Port readiness",
    process: "Background worker (no port)",
};

function appStatusFor(status: string | undefined): AppStatus {
    const raw = status?.toLowerCase();
    if (raw === "running") return "running";
    if (raw === "deploying") return "deploying";
    if (raw === "stopped" || raw === "stopping") return "stopped";
    if (raw === "error" || raw === "delete_failed") return "error";
    return "pending";
}

type DeployModeViewProps = {
    app: App;
    currentMode: DeployMode;
    gateId?: string | null;
    repoFullName: string;
    disabled?: boolean;
    onChanged?: () => void;
};

export function DeployModeView({ app, currentMode, gateId, repoFullName, disabled, onChanged }: DeployModeViewProps) {
    const { can, loading } = usePlan();
    const [selected, setSelected] = useState<DeployMode>(currentMode);
    const [saving, setSaving] = useState(false);
    const [permissionMode, setPermissionMode] = useState<"safe" | "safe_with_health" | null>(null);

    const save = async () => {
        if (selected === currentMode) {
            toast.success("Deploy mode is already set");
            return;
        }
        if (selected !== "fast" && !gateId) {
            setPermissionMode(selected);
            return;
        }
        if (!gateId) return;
        setSaving(true);
        try {
            await api.updateDeployGate(app.id, gateId, selected === "fast" ? { enabled: false } : { mode: selected, enabled: true });
            toast.success("Deploy mode saved");
            onChanged?.();
        } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : "Could not save the deploy mode");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Card className="gap-0 rounded-2xl py-0 shadow-xs">
                <div className="px-6 pt-5">
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Deploy mode</h2>
                    <p className="text-sm text-muted-foreground">How careful should Opslin be before going live?</p>
                </div>
                <div className="space-y-5 p-6">
                    <div role="radiogroup" aria-label="Deploy mode" className="space-y-3">
                        {MODES.map((option) => {
                            const Icon = option.icon;
                            const locked = Boolean(option.feature && !loading && !can(option.feature));
                            const checked = selected === option.mode;
                            return (
                                <button
                                    key={option.mode}
                                    type="button"
                                    role="radio"
                                    aria-checked={checked}
                                    aria-disabled={locked || disabled || undefined}
                                    disabled={locked || disabled}
                                    onClick={() => setSelected(option.mode)}
                                    className={cn(
                                        "flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                                        checked ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40",
                                        locked && "cursor-not-allowed opacity-70 hover:bg-card",
                                    )}
                                >
                                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", checked ? "border-primary" : "border-input")} aria-hidden="true">
                                        {checked ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                                    </span>
                                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", checked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                                        <Icon className="size-5" aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold text-foreground">{option.title}</span>
                                        <span className="block text-sm text-muted-foreground">{option.description}</span>
                                    </span>
                                    {option.plan ? (
                                        <span className="flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                            {locked ? <Lock className="size-3" aria-hidden="true" /> : null}
                                            {option.plan}
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <Link href="/pricing" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                            See plans <ExternalLink className="size-3.5" aria-hidden="true" />
                        </Link>
                        <Button onClick={() => void save()} disabled={saving || disabled || loading}>
                            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                            {saving ? "Saving" : "Save deploy mode"}
                        </Button>
                    </div>
                </div>
            </Card>

            <SafeDeployPermissionModal
                open={Boolean(permissionMode)}
                appId={app.id}
                branch={app.branch || "main"}
                repoFullName={repoFullName}
                mode={permissionMode ?? "safe"}
                onOpenChange={(open) => !open && setPermissionMode(null)}
                onSuccess={() => {
                    setPermissionMode(null);
                    onChanged?.();
                }}
            />
        </>
    );
}

export function DeployModeSideCards({ app, healthCheckMode, healthPath }: { app: App; healthCheckMode: HealthCheckMode; healthPath: string }) {
    const { plan } = usePlan();
    const tier = derivePlanTier({ plan: plan?.slug ?? null });
    const shields = deriveShieldStates({ tier, appStatus: appStatusFor(app.status), domainConfigured: Boolean(app.domain && app.domain.trim()) });
    const httpsOn = shields.SSL_Shield === "Active";
    const trafficLocked = shields.Traffic_Guard === "Locked";
    const trafficOn = shields.Traffic_Guard === "Active";

    return (
        <div className="space-y-5">
            <Card className="gap-0 rounded-2xl py-0 shadow-xs">
                <div className="space-y-3 p-5">
                    <h3 className="text-base font-bold text-foreground">Health check</h3>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Mode</dt><dd className="font-medium text-foreground">{HEALTH_LABEL[healthCheckMode]}</dd></div>
                        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Path</dt><dd className="font-mono text-[13px] text-foreground">{healthCheckMode === "process" ? "None" : healthPath || "/"}</dd></div>
                    </dl>
                    <p className="text-xs text-muted-foreground">Opslin visits this address to see if your app is OK.</p>
                </div>
            </Card>
            <Card className="gap-0 rounded-2xl py-0 shadow-xs">
                <div className="space-y-4 p-5">
                    <h3 className="text-base font-bold text-foreground">Protection</h3>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium text-foreground" id="protection-https">HTTPS</p>
                            <p className="text-xs text-muted-foreground">{httpsOn ? "Your app is served securely." : "Turns on once your domain is set up."}</p>
                        </div>
                        <Switch checked={httpsOn} disabled aria-labelledby="protection-https" />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="flex items-center gap-2 text-sm font-medium text-foreground" id="protection-traffic">
                                Block bad traffic
                                {trafficLocked ? <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Starter</span> : null}
                            </p>
                            <p className="text-xs text-muted-foreground">Stops bots and attacks before they reach your app.</p>
                        </div>
                        <Switch checked={trafficOn} disabled aria-labelledby="protection-traffic" />
                    </div>
                    <Link href={`/apps/${app.id}?section=security`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                        All protection <ExternalLink className="size-3.5" aria-hidden="true" />
                    </Link>
                </div>
            </Card>
        </div>
    );
}
