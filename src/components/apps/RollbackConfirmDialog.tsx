"use client";

import { GitCommitHorizontal, Info, RotateCcw } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RollbackConfirmDialogProps = {
    targetSha: string | null;
    /** Optional extra context about the version, shown in a small card. */
    detail?: { message?: string; ago?: string; status?: string } | null;
    open: boolean;
    pending?: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
};

export function RollbackConfirmDialog({
    targetSha,
    detail,
    open,
    pending = false,
    onOpenChange,
    onConfirm,
}: RollbackConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-md gap-5 rounded-2xl p-6">
                <AlertDialogHeader className="items-start gap-4 text-left">
                    <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <RotateCcw className="size-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1.5">
                        <AlertDialogTitle className="text-xl font-bold">
                            Roll back to version {targetSha ?? ""}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Opslin will deploy this version again and re-apply your domain routes. Your current version stays in the history.
                        </AlertDialogDescription>
                    </div>
                </AlertDialogHeader>
                {targetSha ? (
                    <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
                        {detail ? <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><GitCommitHorizontal className="size-4" aria-hidden="true" /></span> : null}
                        <div className="min-w-0 flex-1">
                            <p className="text-muted-foreground">{detail ? "Version" : "Version"} <code className="font-mono text-[13px] font-semibold text-foreground">{targetSha}</code></p>
                            {detail?.message || detail?.ago ? <p className="truncate text-xs text-muted-foreground">{[detail.message, detail.ago].filter(Boolean).join(" · ")}</p> : null}
                        </div>
                        {detail?.status ? <span className="shrink-0 rounded-full bg-success-muted px-2.5 py-0.5 text-xs font-medium text-success-text">{detail.status}</span> : null}
                    </div>
                ) : null}
                {detail ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Info className="size-4 shrink-0" aria-hidden="true" />Your app stays available while we deploy.</p> : null}
                <AlertDialogFooter className="gap-2 sm:justify-end">
                    <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={pending || !targetSha}
                        onClick={onConfirm}
                    >
                        Confirm Rollback
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
