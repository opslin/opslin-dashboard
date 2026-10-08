"use client";

import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    /** Content for the selected section. Rendered inside the tab panel so the tabs have a real `tabpanel` to control. */
    children?: React.ReactNode;
};

export function AppSectionNav({ value, onValueChange, className, children }: AppSectionNavProps) {
    return (
        <Tabs
            value={value}
            onValueChange={(next) => onValueChange(next as AppSectionId)}
            className={cn("gap-0", className)}
        >
            <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <TabsList variant="line" aria-label="App sections" className="min-w-max">
                    {APP_SECTIONS.map((section) => (
                        <TabsTrigger key={section.id} value={section.id}>
                            {section.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>
            {children ? (
                <TabsContent value={value} className="mt-6 space-y-6">
                    {children}
                </TabsContent>
            ) : null}
        </Tabs>
    );
}
