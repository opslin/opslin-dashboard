"use client";

import { cn } from "@/lib/utils";

interface HeaderProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    /** Breadcrumb slot for detail pages. Render a <Breadcrumb> from ui/breadcrumb.tsx. */
    breadcrumb?: React.ReactNode;
    className?: string;
}

/**
 * Page header: breadcrumb, title and description on the left, page actions on
 * the right. Sits directly on the canvas (no wrapping panel) so the first card
 * on every page starts at the same rhythm.
 */
export function Header({ title, description, actions, breadcrumb, className }: HeaderProps) {
    return (
        <header className={cn("dashboard-page pb-0 pt-6 lg:pt-8", className)}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
                    {description ? (
                        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
                    ) : null}
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
        </header>
    );
}
