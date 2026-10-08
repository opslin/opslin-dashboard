"use client";

import { cn } from "@/lib/utils";

interface HeaderProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    /** Breadcrumb slot for detail pages. Render a <Breadcrumb> from ui/breadcrumb.tsx. */
    breadcrumb?: React.ReactNode;
    /** Small line above the title, e.g. a greeting. */
    eyebrow?: string;
    /** Larger display title for landing pages such as Overview. */
    large?: boolean;
    className?: string;
}

/**
 * Page header: breadcrumb, title and description on the left, page actions on
 * the right. Sits directly on the canvas (no wrapping panel) so the first card
 * on every page starts at the same rhythm.
 */
export function Header({ title, description, actions, breadcrumb, eyebrow, large, className }: HeaderProps) {
    return (
        <header className={cn("dashboard-page pb-0 pt-5 lg:pt-[22px]", className)}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
                    {eyebrow ? <p className="mb-1 text-sm text-muted-foreground">{eyebrow}</p> : null}
                    <h1 className={cn("font-semibold tracking-tight text-foreground", large ? "text-4xl font-bold" : "text-2xl")}>{title}</h1>
                    {description ? (
                        <p className={cn("max-w-3xl text-muted-foreground", large ? "mt-1.5 text-base" : "mt-1 text-sm")}>{description}</p>
                    ) : null}
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
        </header>
    );
}
