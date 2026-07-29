"use client";

import { useState } from "react";
import { CheckCircle2, LockKeyhole, Rocket, ShieldCheck, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlanGate } from "@/components/PlanGate";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { usePlan } from "@/hooks/usePlan";
import { cn } from "@/lib/utils";
import { SafeDeployPermissionModal } from "@/components/SafeDeployPermissionModal";
import type { DeployGateMode } from "@/lib/api";

export type DeployMode = "fast" | DeployGateMode;

type DeployModeSelectorProps = {
    idPrefix?: string;
    appId: string;
    branch: string;
    repoFullName: string;
    currentMode: DeployMode;
    hasSafeDeployGate: boolean;
    disabled?: boolean;
    onModeChange?: (mode: DeployMode) => void;
    onSetupComplete?: () => void;
};

type ModeOption = {
    mode: DeployMode;
    title: string;
    description: string;
    requiredPlan: "Included" | "Starter" | "Pro";
    requiredFeature?: string;
    icon: typeof Rocket;
};

const modeOptions: ModeOption[] = [
    {
        mode: "fast",
        title: "Fast Deploy",
        description: "Deploy immediately from the selected branch.",
        requiredPlan: "Included",
        icon: Rocket,
    },
    {
        mode: "safe",
        title: "Safe Deploy",
        description: "Run GitHub Actions before Opslin deploys the commit.",
        requiredPlan: "Starter",
        requiredFeature: "deploy.safeDeploy",
        icon: ShieldCheck,
    },
    {
        mode: "safe_with_health",
        title: "Safe Deploy + Health Check",
        description: "Add post-deploy health checks and virtual-user validation.",
        requiredPlan: "Pro",
        requiredFeature: "testing.postDeployHealth",
        icon: Stethoscope,
    },
];

function ModeButton({
    option,
    selected,
    locked,
    idPrefix,
    disabled,
    onClick,
}: {
    option: ModeOption;
    selected: boolean;
    locked: boolean;
    idPrefix: string;
    disabled?: boolean;
    onClick: () => void;
}) {
    const Icon = option.icon;

    return (
        <button
            id={`${idPrefix}-${option.mode}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "group flex min-h-36 w-full flex-col justify-between rounded-lg border p-4 text-left transition-all",
                "bg-card/70 shadow-sm backdrop-blur hover:border-primary/45 hover:bg-card",
                selected ? "border-primary/70 ring-2 ring-primary/20" : "border-border/80",
                locked ? "opacity-85" : "",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            )}
        >
            <span className="flex items-start justify-between gap-3">
                <span className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border",
                    selected ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"
                )}>
                    <Icon className="h-5 w-5" />
                </span>
                <span className="flex items-center gap-2">
                    {locked ? (
                        <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                    ) : selected ? (
                        <CheckCircle2 className="h-4 w-4 text-success-text" />
                    ) : null}
                    <Badge
                        variant="outline"
                        className={cn(
                            "rounded-md border-border/80 bg-background/60",
                            locked ? "text-warning-text" : "text-muted-foreground"
                        )}
                    >
                        {option.requiredPlan === "Included" ? "Included" : `${option.requiredPlan}+`}
                    </Badge>
                </span>
            </span>
            <span className="mt-4 block space-y-1.5">
                <span className="block text-sm font-semibold text-foreground">{option.title}</span>
                <span className="block text-sm leading-5 text-muted-foreground">{option.description}</span>
            </span>
        </button>
    );
}

export function DeployModeSelector({
    idPrefix = "deploy-mode",
    appId,
    branch,
    repoFullName,
    currentMode,
    hasSafeDeployGate,
    disabled,
    onModeChange,
    onSetupComplete,
}: DeployModeSelectorProps) {
    const { can, loading } = usePlan();
    const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
    const [permissionMode, setPermissionMode] = useState<DeployGateMode | null>(null);

    const handleSelect = (option: ModeOption) => {
        if (disabled || loading) {
            return;
        }
        if (option.requiredFeature && !can(option.requiredFeature)) {
            setUpgradeFeature(option.requiredFeature);
            return;
        }
        if (option.mode !== "fast" && !hasSafeDeployGate) {
            setPermissionMode(option.mode);
            return;
        }
        onModeChange?.(option.mode);
    };

    return (
        <section
            id={`${idPrefix}-section`}
            className="dashboard-surface overflow-hidden"
            aria-labelledby={`${idPrefix}-title`}
        >
            <div className="border-b border-border/70 px-5 py-4">
                <p className="dashboard-section-label">Deployment Mode</p>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 id={`${idPrefix}-title`} className="text-lg font-semibold text-foreground">
                            Release safety
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Choose how much verification Opslin requires before promoting a commit.
                        </p>
                    </div>
                    <Badge variant="outline" className="w-fit rounded-md bg-secondary/60">
                        Current: {currentMode === "fast" ? "Fast Deploy" : currentMode === "safe" ? "Safe Deploy" : "Safe + Health"}
                    </Badge>
                </div>
            </div>
            <div className="grid gap-3 p-5 lg:grid-cols-3" role="radiogroup" aria-label="Deployment mode">
                {modeOptions.map((option) => {
                    const selected = currentMode === option.mode;
                    const locked = Boolean(option.requiredFeature && !can(option.requiredFeature));
                    const button = (
                        <ModeButton
                            key={option.mode}
                            option={option}
                            selected={selected}
                            locked={locked}
                            idPrefix={idPrefix}
                            disabled={disabled || loading}
                            onClick={() => handleSelect(option)}
                        />
                    );

                    if (!option.requiredFeature) {
                        return button;
                    }

                    return (
                        <PlanGate
                            key={option.mode}
                            feature={option.requiredFeature}
                            fallback={button}
                        >
                            {button}
                        </PlanGate>
                    );
                })}
            </div>

            <Dialog open={Boolean(upgradeFeature)} onOpenChange={(open) => !open && setUpgradeFeature(null)}>
                <DialogContent className="max-w-md" showCloseButton={false}>
                    <DialogHeader>
                        <DialogTitle>Upgrade required</DialogTitle>
                    </DialogHeader>
                    {upgradeFeature ? <UpgradePrompt idPrefix={`${idPrefix}-upgrade`} feature={upgradeFeature} /> : null}
                </DialogContent>
            </Dialog>

            <SafeDeployPermissionModal
                open={Boolean(permissionMode)}
                appId={appId}
                branch={branch}
                repoFullName={repoFullName}
                mode={permissionMode ?? "safe"}
                onOpenChange={(open) => {
                    if (!open) {
                        setPermissionMode(null);
                    }
                }}
                onSuccess={() => {
                    const enabledMode = permissionMode ?? "safe";
                    setPermissionMode(null);
                    onModeChange?.(enabledMode);
                    onSetupComplete?.();
                }}
            />
        </section>
    );
}
