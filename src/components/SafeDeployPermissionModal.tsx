"use client";

import { useState } from "react";
import { Loader2, Server, ShieldCheck } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { api, type DeployGateMode, type DeployGateTestRunner } from "@/lib/api";

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
    const [testRunner, setTestRunner] = useState<DeployGateTestRunner>("github_actions");

    const enableSafeDeployment = async () => {
        setLoading(true);
        setError(null);

        try {
            await api.createDeployGate(appId, {
                branch,
                mode,
                testRunner,
                repoFullName,
            });
            if (testRunner === "github_actions") {
                await api.setupSafeDeploy(appId, { branch });
            }
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
                            <div role="radiogroup" aria-label="Test runner" className="grid gap-2 sm:grid-cols-2">
                                <button
                                    id="safe-deploy-test-runner-github"
                                    type="button"
                                    role="radio"
                                    aria-checked={testRunner === "github_actions"}
                                    disabled={loading}
                                    onClick={() => setTestRunner("github_actions")}
                                    className={cn(
                                        "flex flex-col gap-1 rounded-lg border p-3 text-left transition-all",
                                        "bg-card/70 hover:border-primary/45 hover:bg-card",
                                        testRunner === "github_actions" ? "border-primary/70 ring-2 ring-primary/20" : "border-border/80"
                                    )}
                                >
                                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                        <ShieldCheck className="h-4 w-4" />
                                        Run tests on GitHub Actions
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        Free — runs on GitHub&apos;s compute, not your server. Default.
                                    </span>
                                </button>
                                <button
                                    id="safe-deploy-test-runner-agent"
                                    type="button"
                                    role="radio"
                                    aria-checked={testRunner === "agent"}
                                    disabled={loading}
                                    onClick={() => setTestRunner("agent")}
                                    className={cn(
                                        "flex flex-col gap-1 rounded-lg border p-3 text-left transition-all",
                                        "bg-card/70 hover:border-primary/45 hover:bg-card",
                                        testRunner === "agent" ? "border-primary/70 ring-2 ring-primary/20" : "border-border/80"
                                    )}
                                >
                                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                        <Server className="h-4 w-4" />
                                        Run tests on your own server
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        No workflow file needed — but costs real CPU/RAM/time on your own VPS on every push, including pushes that will fail.
                                    </span>
                                </button>
                            </div>

                            {testRunner === "github_actions" ? (
                                <>
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
                                </>
                            ) : (
                                <>
                                    <p>
                                        Opslin&apos;s agent will run your project&apos;s test command directly on your
                                        VPS before building the deploy candidate — no workflow file or GitHub App
                                        permissions needed.
                                    </p>
                                    <p className="rounded-md border border-warning-text/30 bg-warning-text/10 px-3 py-2 text-warning-text">
                                        Running tests on your own server costs real CPU/RAM/time on your VPS, on
                                        every push, including pushes that will fail.
                                    </p>
                                    <div>
                                        <p className="font-medium text-foreground">Opslin will:</p>
                                        <ul className="mt-2 space-y-1">
                                            <li>✅ Run your test command in a throwaway container before every deploy</li>
                                            <li>✅ Block the deploy if the test command fails, leaving your live app untouched</li>
                                            <li>✅ Deploy only after tests pass</li>
                                        </ul>
                                    </div>
                                </>
                            )}
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
