"use client";

import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Link,
    Lock,
    MinusCircle,
    XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AppDomainStatus } from "@/lib/api";

const statusMeta: Record<AppDomainStatus, {
    label: string;
    className: string;
    icon: typeof Clock3;
}> = {
    pending_dns: {
        label: "Waiting for DNS",
        className: "border-warning/30 bg-warning-muted text-warning-text",
        icon: Clock3,
    },
    misconfigured: {
        label: "Needs DNS fix",
        className: "border-warning/30 bg-warning-muted text-warning-text",
        icon: AlertTriangle,
    },
    connected: {
        label: "DNS Connected",
        className: "border-info/30 bg-info-muted text-info-text",
        icon: Link,
    },
    ssl_pending: {
        label: "SSL Pending",
        className: "border-info/30 bg-info-muted text-info-text",
        icon: Lock,
    },
    active: {
        label: "Active HTTPS",
        className: "border-success/30 bg-success-muted text-success-text",
        icon: CheckCircle2,
    },
    failed: {
        label: "Failed",
        className: "border-danger/30 bg-danger-muted text-danger-text",
        icon: XCircle,
    },
    disabled: {
        label: "Disabled",
        className: "border-border bg-secondary text-muted-foreground",
        icon: MinusCircle,
    },
};

export function DomainStatusBadge({ status }: { status: AppDomainStatus }) {
    const meta = statusMeta[status];
    const Icon = meta.icon;

    return (
        <Badge variant="outline" className={cn("gap-1.5 px-2.5 py-1", meta.className)}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{meta.label}</span>
        </Badge>
    );
}
