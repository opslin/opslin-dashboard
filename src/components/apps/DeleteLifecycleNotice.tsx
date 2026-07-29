"use client";

import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DeleteLifecycleNoticeProps = {
    status: string;
    errorReason?: string | null;
    onRetry?: () => void;
    retryPending?: boolean;
    className?: string;
};

export function DeleteLifecycleNotice({
    status,
    errorReason,
    onRetry,
    retryPending = false,
    className,
}: DeleteLifecycleNoticeProps) {
    if (status === "deleting") {
        return (
            <section className={cn("rounded-lg border border-warning/30 bg-warning-muted p-4 text-foreground", className)}>
                <div className="flex items-start gap-3">
                    <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-warning-text" />
                    <div>
                        <h3 className="font-semibold">Deleting app</h3>
                        <p className="mt-1 text-sm text-foreground/80">
                            Cleanup is running on the server. The app will disappear after cleanup succeeds.
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    if (status === "delete_failed") {
        return (
            <section className={cn("rounded-lg border border-danger/30 bg-danger-muted p-4 text-foreground", className)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" />
                        <div className="min-w-0">
                            <h3 className="font-semibold">Delete cleanup failed</h3>
                            <p className="mt-1 text-sm text-foreground/80">
                                Opslin could not finish removing this app from the server. The app record is kept so cleanup can be retried safely.
                            </p>
                            {errorReason && (
                                <p className="mt-3 rounded-md border border-danger/30 bg-card/70 px-3 py-2 font-mono text-xs text-foreground">
                                    {errorReason}
                                </p>
                            )}
                        </div>
                    </div>
                    {onRetry && (
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={onRetry}
                            disabled={retryPending}
                            className="shrink-0"
                        >
                            {retryPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <RotateCcw className="mr-2 h-4 w-4" />
                            )}
                            Retry cleanup
                        </Button>
                    )}
                </div>
            </section>
        );
    }

    return null;
}
