"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type EnterpriseContactInput } from "@/lib/api";

const EMPTY_FORM: EnterpriseContactInput = {
    name: "",
    email: "",
    company: "",
    teamSize: "",
    message: "",
};

export function ContactSalesDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: (message: string) => void;
}) {
    const [form, setForm] = useState<EnterpriseContactInput>(EMPTY_FORM);
    const mutation = useMutation({
        mutationFn: (payload: EnterpriseContactInput) => api.submitEnterpriseContact(payload),
        onSuccess: (result) => {
            onOpenChange(false);
            setForm(EMPTY_FORM);
            onSuccess?.(result.message);
        },
    });

    const disabled = mutation.isPending ||
        !form.name.trim() ||
        !form.email.trim() ||
        !form.company.trim();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Contact sales</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="enterprise-name">Name</Label>
                            <Input
                                id="enterprise-name"
                                value={form.name}
                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="enterprise-email">Work email</Label>
                            <Input
                                id="enterprise-email"
                                type="email"
                                value={form.email}
                                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="enterprise-company">Company</Label>
                            <Input
                                id="enterprise-company"
                                value={form.company}
                                onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="enterprise-team-size">Team size</Label>
                            <Input
                                id="enterprise-team-size"
                                value={form.teamSize || ""}
                                onChange={(event) => setForm((current) => ({ ...current, teamSize: event.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="enterprise-message">Deployment requirements</Label>
                        <Textarea
                            id="enterprise-message"
                            value={form.message || ""}
                            onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                        />
                    </div>
                    <div className="flex justify-end">
                        <Button type="button" onClick={() => mutation.mutate(form)} disabled={disabled}>
                            {mutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Sending
                                </>
                            ) : "Send inquiry"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
