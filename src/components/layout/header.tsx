"use client";

import { cn } from "@/lib/utils";

interface HeaderProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    /** Breadcrumb slot for detail pages (design-system.md §5 "PageHeader"). Render a <Breadcrumb> from ui/breadcrumb.tsx. */
    breadcrumb?: React.ReactNode;
    className?: string;
}

export function Header({ title, description, actions, breadcrumb, className }: HeaderProps) {
    return (
        <header className={cn("dashboard-page pb-0", className)}>
            <div className="dashboard-surface flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
                    <h1 className="text-2xl font-medium tracking-tight text-foreground">{title}</h1>
                    {description ? (
                        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
                    ) : null}
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
        </header>
    );
}
