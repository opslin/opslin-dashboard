"use client";

import { StatusBadge } from "@/components/ui/status-badge";

export function AppStatusBadge({
    status,
    className,
}: {
    status: string;
    className?: string;
}) {
    return <StatusBadge status={status} className={className} />;
}
