"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { api, type DeployGateMode } from "@/lib/api";

type SafeDeployPermissionModalProps = {
    open: boolean;
    appId: string;
    branch: string;
    repoFullName: string;
    mode: DeployGateMode;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
};

export function SafeDeployPermissionModal({
    open,
    appId,
    branch,
    repoFullName,
    mode,
    onOpenChange,
    onSuccess,
}: SafeDeployPermissionModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const enableSafeDeployment = async () => {
        setLoading(true);
        setError(null);

        try {
            await api.createDeployGate(appId, {
                branch,
                mode,
                repoFullName,
            });
            await api.setupSafeDeploy(appId, { branch });
            toast.success("Safe Deploy setup started");
            onSuccess?.();
        } catch (caught) {
            const message = caught instanceof Error ? caught.message : "Safe Deploy setup failed";
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
            <DialogContent showCloseButton={false} className="max-w-2xl border-border/80 bg-card/95 shadow-2xl backdrop-blur">
                <DialogHeader className="gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                    <DialogTitle id="safe-deploy-permission-title">Enable Safe Deployment</DialogTitle>
                    <DialogDescription asChild>
                        <div className="space-y-5 text-left text-sm leading-6 text-muted-foreground">
                            <p>
                                Opslin will add a GitHub Actions workflow to this repository
                                <br />
                                so your app can be tested before deployment.
                            </p>

                            <div>
                                <p className="font-medium text-foreground">Opslin will be able to:</p>
                                <ul className="mt-2 space-y-1">
                                    <li>✅ Add a workflow file under .github/workflows/</li>
                                    <li>✅ Add deployment secrets used only for this app</li>
                                    <li>✅ Read workflow results</li>
                                    <li>✅ Deploy only after checks pass</li>
                                </ul>
                            </div>

                            <div>
                                <p className="font-medium text-foreground">Opslin will NOT:</p>
                                <ul className="mt-2 space-y-1">
                                    <li>❌ Modify your application source code</li>
                                    <li>❌ Access repositories you did not select</li>
                                    <li>❌ Deploy without your configured rules</li>
                                    <li>❌ Expose your secrets in logs or UI</li>
                                </ul>
                            </div>

                            <p>You can revoke this access anytime from GitHub settings.</p>
                        </div>
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <div
                        id="safe-deploy-permission-error"
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                    >
                        {error}
                    </div>
                ) : null}

                <DialogFooter>
                    <Button
                        id="safe-deploy-permission-cancel"
                        type="button"
                        variant="outline"
                        disabled={loading}
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        id="safe-deploy-permission-enable"
                        type="button"
                        disabled={loading || !repoFullName || !branch}
                        onClick={enableSafeDeployment}
                    >
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Enable Safe Deployment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
