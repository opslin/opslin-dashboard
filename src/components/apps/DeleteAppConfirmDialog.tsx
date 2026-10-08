"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DeleteAppConfirmDialogProps = {
    appName: string;
    open: boolean;
    pending?: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
};

export function DeleteAppConfirmDialog({
    appName,
    open,
    pending = false,
    onOpenChange,
    onConfirm,
}: DeleteAppConfirmDialogProps) {
    const [typedName, setTypedName] = useState("");
    const confirmed = typedName === appName;

    useEffect(() => {
        if (!open) {
            setTypedName("");
        }
    }, [open]);

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-md gap-5 rounded-2xl p-6">
                <AlertDialogHeader className="items-start gap-4 text-left">
                    <span className="flex size-12 items-center justify-center rounded-full bg-danger-muted text-danger-text">
                        <Trash2 className="size-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1.5">
                        <AlertDialogTitle className="text-xl font-bold">Delete app?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This stops <span className="font-semibold text-foreground">{appName}</span>{" "}and removes its containers, files and domains. This can&apos;t be undone.
                        </AlertDialogDescription>
                    </div>
                </AlertDialogHeader>

                <div className="space-y-2">
                    <Label htmlFor="delete-app-confirm-name">Type the app name to confirm</Label>
                    <Input
                        id="delete-app-confirm-name"
                        value={typedName}
                        onChange={(event) => setTypedName(event.target.value)}
                        autoComplete="off"
                        placeholder={appName}
                        disabled={pending}
                        className="h-10"
                    />
                    <p className="text-xs text-muted-foreground">Type <span className="font-medium text-foreground">{appName}</span> to enable the delete button.</p>
                </div>

                <AlertDialogFooter className="gap-2 sm:justify-end">
                    <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={!confirmed || pending}
                        onClick={onConfirm}
                    >
                        {pending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Delete App
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
