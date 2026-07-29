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
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete app?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will stop the app, remove its container/runtime files, remove Opslin-managed domains/routes, and delete the app record after cleanup succeeds.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        App name: <span className="font-medium text-foreground">{appName}</span>
                    </p>
                    <Label htmlFor="delete-app-confirm-name">Type the app name to confirm.</Label>
                    <Input
                        id="delete-app-confirm-name"
                        value={typedName}
                        onChange={(event) => setTypedName(event.target.value)}
                        autoComplete="off"
                        disabled={pending}
                    />
                </div>

                <AlertDialogFooter>
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
