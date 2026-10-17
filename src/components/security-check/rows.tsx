"use client";

import { cn } from "@/lib/utils";

/**
 * A flat row (DESIGN.md S2): label on the left, state on the right, at most one action. Unlike the Media
 * page's row, the label keeps a minimum width, so on a phone a long state wraps below the label instead of
 * painting over it.
 */
export function CheckRow({
    leading,
    label,
    state,
    action,
    className,
}: {
    leading?: React.ReactNode;
    label: React.ReactNode;
    state?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5", className)}>
            {leading ? <span className="flex w-6 shrink-0 items-center">{leading}</span> : null}
            <span className="min-w-[min(100%,9rem)] flex-1 break-words text-sm font-medium text-foreground">{label}</span>
            {state ? <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">{state}</span> : null}
            {action ? <span className="shrink-0">{action}</span> : null}
        </div>
    );
}
