"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, EyeOff, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type App } from "@/lib/api";

// DIL Phase 23 — the actionable half of a "this deploy is blocked on config
// it can't infer" alert. Before this, that conclusion was reached correctly
// by the deploy's AI diagnose loop and then thrown away: it lived only in a
// Job.result blob no page rendered, so a user whose worker needed
// OPENROUTER_API_KEY had no way to discover that, let alone fix it. This
// collects the real values and redeploys in one action.

type PendingConfigDialogProps = {
    app: App;
    serverId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function PendingConfigDialog({ app, serverId, open, onOpenChange }: PendingConfigDialogProps) {
    const queryClient = useQueryClient();
    const keys = useMemo(() => app.pendingConfig?.keys ?? [], [app.pendingConfig]);

    const [values, setValues] = useState<Record<string, string>>({});
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});

    // Reset whenever the dialog is reopened (or points at a different app) —
    // half-typed secrets from a previous visit must never persist silently.
    // Adjusted during render rather than in an effect: this is React's own
    // documented pattern for derived-from-props state, and it avoids the
    // cascading extra render an effect-based reset would cause.
    const identity = `${app.id}:${open}`;
    const [lastIdentity, setLastIdentity] = useState(identity);
    if (identity !== lastIdentity) {
        setLastIdentity(identity);
        setValues({});
        setRevealed({});
    }

    const filledKeys = keys.filter((key) => values[key]?.trim());
    const allFilled = keys.length > 0 && filledKeys.length === keys.length;

    const saveAndRedeploy = useMutation({
        mutationFn: async () => {
            // updateAppEnvVars REPLACES wholesale — merging onto whatever the
            // app already has is what stops this from wiping every unrelated
            // variable the deploy auto-wired (DATABASE_URL, S3 credentials).
            const merged: Record<string, string> = { ...(app.envVars || {}) };
            for (const key of filledKeys) {
                merged[key] = values[key].trim();
            }
            await api.updateAppEnvVars(serverId, app.id, merged);

            // Saved and redeploy are reported separately on purpose: if the
            // redeploy trigger fails, the values ARE already stored, and a
            // single "could not save" error would be a lie that sends the
            // user back to re-enter secrets they've already supplied.
            try {
                await api.deployApp(serverId, app.id);
                return { saved: true, redeployed: true };
            } catch (error) {
                return {
                    saved: true,
                    redeployed: false,
                    redeployError: error instanceof Error ? error.message : "Redeploy could not be started",
                };
            }
        },
        onSuccess: (result) => {
            const savedLabel = allFilled
                ? "Configuration saved"
                : `Saved ${filledKeys.length} of ${keys.length} values`;
            if (result.redeployed) {
                toast.success(`${savedLabel} — redeploying now`);
            } else {
                toast.warning(`${savedLabel}, but the redeploy didn't start: ${result.redeployError}`);
            }
            void queryClient.invalidateQueries({ queryKey: ["all-apps"] });
            void queryClient.invalidateQueries({ queryKey: ["app", app.id] });
            onOpenChange(false);
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Could not save the configuration");
        },
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="size-4 text-destructive" />
                        Configuration needed
                    </DialogTitle>
                    <DialogDescription>
                        {`${app.name} deployed, but it can't start until these values are set. `}
                        {`Opslin won't guess at secrets, so it stopped and left them to you.`}
                    </DialogDescription>
                </DialogHeader>

                {app.pendingConfig?.reason && (
                    <p className="rounded-md border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
                        {app.pendingConfig.reason}
                    </p>
                )}

                <div className="flex flex-col gap-3">
                    {keys.map((key) => (
                        <div key={key} className="flex flex-col gap-1.5">
                            <Label htmlFor={`pending-${key}`} className="text-xs font-medium">
                                {key}
                            </Label>
                            <div className="relative">
                                <Input
                                    id={`pending-${key}`}
                                    type={revealed[key] ? "text" : "password"}
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder="Paste the value"
                                    value={values[key] ?? ""}
                                    onChange={(event) =>
                                        setValues((prev) => ({ ...prev, [key]: event.target.value }))
                                    }
                                    className="pr-9"
                                />
                                <button
                                    type="button"
                                    onClick={() => setRevealed((prev) => ({ ...prev, [key]: !prev[key] }))}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                    aria-label={revealed[key] ? `Hide ${key}` : `Show ${key}`}
                                >
                                    {revealed[key] ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {filledKeys.length > 0 && !allFilled && (
                    <p className="text-[11px] text-muted-foreground">
                        {keys.length - filledKeys.length} value{keys.length - filledKeys.length === 1 ? "" : "s"} still
                        empty — the app may fail again until every one is set.
                    </p>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saveAndRedeploy.isPending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => saveAndRedeploy.mutate()}
                        disabled={filledKeys.length === 0 || saveAndRedeploy.isPending}
                    >
                        {saveAndRedeploy.isPending
                            ? <Loader2 className="mr-2 size-4 animate-spin" />
                            : <Rocket className="mr-2 size-4" />}
                        Save &amp; redeploy
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
