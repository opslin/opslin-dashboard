"use client";

import { Fragment, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/utils";
import { api, type AppDomainRecord, type DnsInstruction } from "@/lib/api";
import { AddCustomDomainModal } from "./AddCustomDomainModal";
import { DomainDeleteDialog } from "./DomainDeleteDialog";
import { DnsInstructionCard } from "./DnsInstructionCard";
import { DomainStatusDetail } from "./DomainStatusDetail";
import { DomainStatusBadge } from "./DomainStatusBadge";

type CustomDomainsTableProps = {
    domains: AppDomainRecord[];
    appId: string;
};

async function copyDomain(domain: string) {
    await navigator.clipboard.writeText(domain);
    toast.success("Copied!", { duration: 2000 });
}

function formatResolvedIps(resolvedIps: AppDomainRecord["resolvedIps"]) {
    if (!resolvedIps || resolvedIps.length === 0) {
        return "Not checked";
    }
    return resolvedIps.join(", ");
}

function getDnsRecordName(domain: string) {
    const labels = domain.toLowerCase().split(".").filter(Boolean);
    if (labels.length <= 2) {
        return "@";
    }
    return labels.slice(0, -2).join(".");
}

function getDnsInstruction(domain: AppDomainRecord): DnsInstruction {
    return {
        type: "A",
        name: getDnsRecordName(domain.domain),
        value: domain.expectedIp || "Not configured",
        ttl: "Auto",
    };
}

function isRateLimitError(error: unknown) {
    return (
        typeof error === "object"
        && error !== null
        && "status" in error
        && (error as { status?: unknown }).status === 429
    );
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return "Check failed. Please try again.";
}

function isActiveUrl(domain: AppDomainRecord) {
    return domain.enabled && ["connected", "active"].includes(domain.status);
}

function domainUrl(domain: AppDomainRecord) {
    return domain.preferredUrl || `${domain.sslStatus === "active" ? "https" : "http"}://${domain.domain}`;
}

function canRetrySsl(domain: AppDomainRecord) {
    if (!domain.enabled || domain.sslStatus === "active") {
        return false;
    }
    return Boolean(domain.canRetrySsl ?? (domain.status === "connected" || domain.status === "active"));
}

export function CustomDomainsTable({ domains, appId }: CustomDomainsTableProps) {
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [checkingDomainId, setCheckingDomainId] = useState<string | null>(null);
    const [retryingDomainId, setRetryingDomainId] = useState<string | null>(null);
    const [domainToDelete, setDomainToDelete] = useState<AppDomainRecord | null>(null);
    const queryClient = useQueryClient();
    const customDomains = domains.filter((domain) => domain.type === "custom");
    const activeUrlCount = domains.filter(isActiveUrl).length;

    const checkMutation = useMutation({
        mutationFn: (domainId: string) => api.checkAppDomain(appId, domainId),
        onMutate: (domainId) => {
            setCheckingDomainId(domainId);
        },
        onSettled: () => {
            setCheckingDomainId(null);
            queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });
        },
        onError: (error) => {
            if (isRateLimitError(error)) {
                toast.error("Too many checks. Please wait a few minutes before trying again.");
                return;
            }
            toast.error(getErrorMessage(error));
        },
    });

    const retrySslMutation = useMutation({
        mutationFn: (domainId: string) => api.retryDomainSsl(appId, domainId),
        onMutate: (domainId) => {
            setRetryingDomainId(domainId);
        },
        onSettled: () => {
            setRetryingDomainId(null);
            queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to retry SSL");
        },
    });

    const handleAddSuccess = () => {
        queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });
    };

    const handleDeleteSuccess = () => {
        queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });
    };

    if (customDomains.length === 0) {
        return (
            <>
                <Card data-app-id={appId}>
                    <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <CardTitle className="text-lg">Custom Domains</CardTitle>
                            <CardDescription>Bring your own domain to this app.</CardDescription>
                        </div>
                        <Button onClick={() => setAddModalOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Add Custom Domain
                        </Button>
                    </CardHeader>
                    <CardContent className="rounded-xl border border-dashed p-6">
                        <p className="font-medium text-foreground">No custom domains connected yet.</p>
                        <p className="text-sm text-muted-foreground">
                            Your app works through the temporary URL above.
                        </p>
                    </CardContent>
                </Card>
                <AddCustomDomainModal
                    appId={appId}
                    open={addModalOpen}
                    onOpenChange={setAddModalOpen}
                    onSuccess={handleAddSuccess}
                />
            </>
        );
    }

    return (
        <>
            <Card data-app-id={appId}>
                <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle className="text-lg">Custom Domains</CardTitle>
                        <CardDescription>
                            DNS state for domains that point traffic to this app.
                        </CardDescription>
                    </div>
                    <Button onClick={() => setAddModalOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Add Custom Domain
                    </Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Domain</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Expected IP</TableHead>
                                <TableHead>Resolved IPs</TableHead>
                                <TableHead>Last Checked</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customDomains.map((domain) => {
                                const url = domainUrl(domain);
                                const isChecking = checkingDomainId === domain.id;
                                const isRetryingSsl = retryingDomainId === domain.id;
                                const showDnsInstructions = domain.status === "pending_dns";
                                return (
                                    <Fragment key={domain.id}>
                                        <TableRow>
                                            <TableCell className="font-mono font-medium">
                                                {domain.domain}
                                            </TableCell>
                                            <TableCell>
                                                <DomainStatusBadge status={domain.status} />
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {domain.expectedIp || "Not set"}
                                            </TableCell>
                                            <TableCell className="max-w-[220px] whitespace-normal font-mono text-xs text-muted-foreground">
                                                {formatResolvedIps(domain.resolvedIps)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {domain.lastCheckedAt ? formatRelativeTime(domain.lastCheckedAt) : "Never"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={isChecking}
                                                        onClick={() => checkMutation.mutate(domain.id)}
                                                    >
                                                        {isChecking ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : null}
                                                        Check Connection
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={() => copyDomain(domain.domain)}
                                                        aria-label={`Copy ${domain.domain}`}
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon-sm" asChild>
                                                        <a
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            aria-label={`Open ${domain.domain}`}
                                                        >
                                                            <ExternalLink className="h-4 w-4" />
                                                        </a>
                                                    </Button>
                                                    {canRetrySsl(domain) ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={isRetryingSsl}
                                                            onClick={() => retrySslMutation.mutate(domain.id)}
                                                        >
                                                            {isRetryingSsl ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : null}
                                                            Retry SSL
                                                        </Button>
                                                    ) : null}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                aria-label={`Open actions for ${domain.domain}`}
                                                            >
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                variant="destructive"
                                                                onClick={() => setDomainToDelete(domain)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                                Remove Domain
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                                            <TableCell colSpan={6} className="space-y-3 p-4">
                                                {showDnsInstructions ? (
                                                    <DnsInstructionCard
                                                        domain={domain.domain}
                                                        instruction={getDnsInstruction(domain)}
                                                        checking={isChecking}
                                                        onCheckConnection={() => checkMutation.mutate(domain.id)}
                                                    />
                                                ) : null}
                                                <DomainStatusDetail
                                                    domain={domain}
                                                    retrying={isRetryingSsl}
                                                    onRetrySsl={canRetrySsl(domain)
                                                        ? () => retrySslMutation.mutate(domain.id)
                                                        : undefined}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    </Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <AddCustomDomainModal
                appId={appId}
                open={addModalOpen}
                onOpenChange={setAddModalOpen}
                onSuccess={handleAddSuccess}
            />
            {domainToDelete ? (
                <DomainDeleteDialog
                    appId={appId}
                    domain={domainToDelete}
                    open={Boolean(domainToDelete)}
                    onOpenChange={(open) => {
                        if (!open) setDomainToDelete(null);
                    }}
                    onSuccess={handleDeleteSuccess}
                    isOnlyActiveUrl={isActiveUrl(domainToDelete) && activeUrlCount === 1}
                />
            ) : null}
        </>
    );
}
