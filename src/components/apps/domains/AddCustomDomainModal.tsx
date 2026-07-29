"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type AddCustomDomainModalProps = {
    appId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
};

function sanitizeDomainInput(input: string): string {
    let domain = input.trim().toLowerCase();
    if (domain.startsWith("http://")) {
        domain = domain.replace("http://", "");
    }
    if (domain.startsWith("https://")) {
        domain = domain.replace("https://", "");
    }
    return domain.replace(/\.+$/, "");
}

function validateDomainInput(input: string): string | null {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return "Domain is required";

    const domain = sanitizeDomainInput(trimmed);
    if (!domain) return "Domain is required";

    if (domain.includes("/")) return "Enter domain only, without paths";
    if (domain.includes("?")) return "Enter domain only, without query parameters";
    if (domain.includes("#")) return "Enter domain only, without fragments";
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
        return "IP addresses are not supported";
    }
    if (!domain.includes(".")) return "Enter a valid domain name (e.g., myclient.com)";

    return null;
}

export function AddCustomDomainModal({
    appId,
    open,
    onOpenChange,
    onSuccess,
}: AddCustomDomainModalProps) {
    const [domainInput, setDomainInput] = useState("");
    const [fieldError, setFieldError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: (domain: string) => api.addCustomDomain(appId, domain),
        onSuccess: () => {
            toast.success("Custom domain added");
            onSuccess();
            onOpenChange(false);
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to add domain");
        },
    });

    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen) {
            setDomainInput("");
            setFieldError(null);
            mutation.reset();
        }
        onOpenChange(nextOpen);
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const error = validateDomainInput(domainInput);
        setFieldError(error);
        if (error) return;

        mutation.mutate(sanitizeDomainInput(domainInput));
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <DialogHeader>
                        <DialogTitle>Add Custom Domain</DialogTitle>
                        <DialogDescription>
                            Connect a domain you own. Opslin will show the exact DNS record to create next.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <Label htmlFor="custom-domain">Your domain</Label>
                        <Input
                            id="custom-domain"
                            value={domainInput}
                            onChange={(event) => {
                                setDomainInput(event.target.value);
                                if (fieldError) setFieldError(null);
                            }}
                            placeholder="myclient.com"
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            aria-invalid={Boolean(fieldError)}
                            disabled={mutation.isPending}
                        />
                        <p className="text-sm text-muted-foreground">
                            Enter your domain without http:// or https://.
                        </p>
                        {fieldError ? (
                            <div className="flex items-center gap-2 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                                <span>{fieldError}</span>
                            </div>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={mutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Add Domain
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
