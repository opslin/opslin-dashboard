"use client";

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
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Roll back to version {targetSha ?? ""}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This will deploy the previous version and re-apply domain routes.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
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
