"use client";

import { useState } from "react";
import { Check, Clipboard, Lightbulb, ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { DnsInstruction } from "@/lib/api";

type DnsInstructionCardProps = {
    instruction: DnsInstruction;
    domain: string;
    checking?: boolean;
    onCheckConnection?: () => void;
};

type CopyField = "name" | "value" | null;

export function DnsInstructionCard({
    instruction,
    domain,
    checking = false,
    onCheckConnection,
}: DnsInstructionCardProps) {
    const [copiedField, setCopiedField] = useState<CopyField>(null);

    async function handleCopy(value: string, field: CopyField) {
        if (!field) return;
        await navigator.clipboard.writeText(value);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    }

    return (
        <Card className="border-warning/30 bg-warning-muted/60 shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-muted text-warning-text">
                        <ListChecks className="h-4 w-4" aria-hidden="true" />
                    </span>
                    DNS Configuration Required
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Go to your domain provider&apos;s DNS settings and add this record for{" "}
                    <span className="font-mono font-medium text-foreground">{domain}</span>.
                </p>

                <div className="overflow-hidden rounded-xl border bg-card/80">
                    <DnsRow label="Type" value={instruction.type} />
                    <DnsRow
                        label="Name"
                        value={instruction.name}
                        onCopy={() => handleCopy(instruction.name, "name")}
                        copied={copiedField === "name"}
                    />
                    <DnsRow
                        label="Value"
                        value={instruction.value}
                        onCopy={() => handleCopy(instruction.value, "value")}
                        copied={copiedField === "value"}
                    />
                    <DnsRow label="TTL" value={instruction.ttl || "Auto"} />
                </div>

                <Separator />

                <div className="flex gap-3 rounded-xl bg-warning-muted p-3 text-sm text-foreground">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>
                        DNS changes can take minutes to hours. Opslin also rechecks automatically every 2
                        hours.
                    </p>
                </div>

                <Button
                    variant="outline"
                    onClick={onCheckConnection}
                    disabled={checking || !onCheckConnection}
                >
                    {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Check Connection
                </Button>
            </CardContent>
        </Card>
    );
}

function DnsRow({
    label,
    value,
    onCopy,
    copied = false,
}: {
    label: string;
    value: string;
    onCopy?: () => void;
    copied?: boolean;
}) {
    return (
        <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {label}
            </span>
            <span className="break-all font-mono text-sm font-semibold text-foreground">{value}</span>
            {onCopy ? (
                <Button type="button" variant="ghost" size="sm" onClick={onCopy}>
                    {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                    {copied ? "Copied!" : "Copy"}
                </Button>
            ) : (
                <span />
            )}
        </div>
    );
}
