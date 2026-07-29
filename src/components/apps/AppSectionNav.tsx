"use client";

import { cn } from "@/lib/utils";

export const APP_SECTIONS = [
    { id: "overview", label: "Overview" },
    { id: "security", label: "Security" },
    { id: "deployments", label: "Deployments" },
    { id: "domains", label: "Domains" },
    { id: "environment", label: "Environment" },
    { id: "logs", label: "Logs" },
    { id: "metrics", label: "Metrics" },
    { id: "settings", label: "Settings" },
] as const;

export type AppSectionId = typeof APP_SECTIONS[number]["id"];

const sectionIds = new Set<string>(APP_SECTIONS.map((section) => section.id));

export function isAppSectionId(value: string | null | undefined): value is AppSectionId {
    return Boolean(value && sectionIds.has(value));
}

export function normalizeAppSection(value: string | null | undefined): AppSectionId {
    return isAppSectionId(value) ? value : "overview";
}

type AppSectionNavProps = {
    value: AppSectionId;
    onValueChange: (value: AppSectionId) => void;
    className?: string;
};

export function AppSectionNav({ value, onValueChange, className }: AppSectionNavProps) {
    return (
        <div className={cn("border-b border-border bg-card -mx-6 px-6 sm:-mx-0 sm:px-0", className)}>
            <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <nav
                    aria-label="App sections"
                    className="flex items-center gap-6 min-w-max"
                >
                    {APP_SECTIONS.map((section) => (
                        <button
                            key={section.id}
                            type="button"
                            role="tab"
                            aria-selected={value === section.id}
                            onClick={() => onValueChange(section.id)}
                            className={cn(
                                "relative py-3 text-sm font-medium transition-colors whitespace-nowrap",
                                "hover:text-foreground",
                                value === section.id
                                    ? "text-brand"
                                    : "text-muted-foreground"
                            )}
                        >
                            {section.label}
                            {/* Active underline */}
                            {value === section.id && (
                                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand rounded-full" />
                            )}
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    );
}
