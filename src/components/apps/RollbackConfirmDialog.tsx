"use client";

import { RotateCcw } from "lucide-react";
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
    open: boolean;
    pending?: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
};

export function RollbackConfirmDialog({
    targetSha,
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
                            Opslin will deploy the previous version and re-apply your domain routes. Your current version stays in the history.
                        </AlertDialogDescription>
                    </div>
                </AlertDialogHeader>
                {targetSha ? (
                    <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3 text-sm">
                        <span className="text-muted-foreground">Version</span>
                        <code className="font-mono text-[13px] font-medium text-foreground">{targetSha}</code>
                    </div>
                ) : null}
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
