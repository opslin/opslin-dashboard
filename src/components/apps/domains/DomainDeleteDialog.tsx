"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, type AppDomainRecord } from "@/lib/api";

type DomainDeleteDialogProps = {
    domain: AppDomainRecord;
    appId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    isOnlyActiveUrl?: boolean;
};

export function DomainDeleteDialog({
    appId,
    domain,
    isOnlyActiveUrl = false,
    onOpenChange,
    onSuccess,
    open,
}: DomainDeleteDialogProps) {
    const deleteMutation = useMutation({
        mutationFn: () => api.removeAppDomain(appId, domain.id),
        onSuccess: () => {
            toast.success(`${domain.domain} has been removed.`);
            onSuccess();
            onOpenChange(false);
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to remove domain");
        },
    });

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                        </span>
                        Remove Domain?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3 text-left">
                        <span className="block">
                            This will remove{" "}
                            <span className="font-mono font-semibold text-foreground">{domain.domain}</span>{" "}
                            from your app.
                        </span>
                        <span className="block">
                            If you have DNS records pointing to this server, they will not be automatically
                            removed from your DNS provider.
                        </span>
                        {isOnlyActiveUrl ? (
                            <span className="block rounded-lg border border-destructive/30 bg-destructive/10 p-3 font-medium text-destructive">
                                This is your only active URL.
                            </span>
                        ) : null}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={deleteMutation.isPending}
                        className={cn(buttonVariants({ variant: "destructive" }))}
                        onClick={(event) => {
                            event.preventDefault();
                            deleteMutation.mutate();
                        }}
                    >
                        {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Remove Domain
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
