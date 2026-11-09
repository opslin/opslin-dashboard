"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What to ask before an action that cannot be undone. This replaces the browser's own `confirm()` pop-up, which embedded
 * browsers (the Claude desktop app's pane, many in-app webviews) silently cancel: the button then looks dead.
 */
export type ConfirmRequest = {
    title: string;
    description: string;
    confirmLabel: string;
    /** Red button, for deleting. */
    destructive?: boolean;
    /** Text shown in a box under the description (for example the query about to run). */
    detail?: string;
    onConfirm: () => void;
};

export function ConfirmActionDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
    return (
        <AlertDialog open={request !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{request?.title}</AlertDialogTitle>
                    <AlertDialogDescription>{request?.description}</AlertDialogDescription>
                </AlertDialogHeader>
                {request?.detail ? <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs text-foreground whitespace-pre-wrap break-words">{request.detail}</pre> : null}
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        data-testid="confirm-action-button"
                        className={cn(request?.destructive && buttonVariants({ variant: "destructive" }))}
                        onClick={() => request?.onConfirm()}
                    >
                        {request?.confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
