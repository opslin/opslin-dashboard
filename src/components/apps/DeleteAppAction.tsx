"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteAppConfirmDialog } from "./DeleteAppConfirmDialog";

type DeleteAppActionProps = {
    appName: string;
    onConfirm: () => void;
    pending?: boolean;
    disabled?: boolean;
    size?: "sm" | "default";
    className?: string;
};

export function DeleteAppAction({
    appName,
    onConfirm,
    pending = false,
    disabled = false,
    size = "default",
    className,
}: DeleteAppActionProps) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                type="button"
                variant="destructive"
                size={size}
                className={className}
                onClick={() => setOpen(true)}
                disabled={disabled || pending}
            >
                {pending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete App
            </Button>
            <DeleteAppConfirmDialog
                appName={appName}
                open={open}
                pending={pending}
                onOpenChange={setOpen}
                onConfirm={() => {
                    onConfirm();
                    setOpen(false);
                }}
            />
        </>
    );
}
