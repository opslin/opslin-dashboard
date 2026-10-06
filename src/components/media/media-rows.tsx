"use client";

import Image from "next/image";
import { ChevronRight, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Flat row primitives for the Media page (DESIGN.md S1/S2): one opaque container, rows with
 * the label on the left, the current state on the right and at most one action, separated by
 * hairlines. No card inside a card, no glass.
 */

export function Panel({ children, className, ...props }: React.ComponentProps<"div">) {
    return (
        <Card className={cn("gap-0 overflow-hidden py-0", className)} {...props}>
            {children}
        </Card>
    );
}

export function Section({ label, children }: { label?: string; children: React.ReactNode }) {
    return (
        <section className="border-t border-border/70 first:border-t-0">
            {label ? <h2 className="px-5 pb-1 pt-4 text-xs font-medium text-muted-foreground">{label}</h2> : null}
            <div className="divide-y divide-border/70">{children}</div>
        </section>
    );
}

export function Row({
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
        <div className={cn("flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5", className)}>
            {leading ? <span className="flex w-11 shrink-0 items-center">{leading}</span> : null}
            <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{label}</span>
            {state ? <span className="flex items-center gap-2 text-sm text-muted-foreground">{state}</span> : null}
            {action ? <span className="shrink-0">{action}</span> : null}
        </div>
    );
}

/** A neutral locked state line (DESIGN.md P4/C5): visible, says why, never red. */
export function LockedLine({ children }: { children: React.ReactNode }) {
    return (
        <p className="flex items-center gap-2 px-5 py-3 text-sm text-muted-foreground" role="status">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            {children}
        </p>
    );
}

/** The official Cloudflare mark (DESIGN.md V5: show a service with its logo, not a generic icon). */
export function CloudflareMark({ className }: { className?: string }) {
    return (
        <Image
            src="/brands/cloudflare.svg"
            alt=""
            width={44}
            height={20}
            unoptimized
            className={cn("h-5 w-auto", className)}
        />
    );
}

/** Collapsed detail (DESIGN.md P3/S3): label only, the chevron rotates 90 degrees when opened. */
export function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <details className="group border-t border-border/70">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 transition-transform duration-150 motion-reduce:transition-none group-open:rotate-90" aria-hidden="true" />
                {label}
            </summary>
            {children}
        </details>
    );
}
