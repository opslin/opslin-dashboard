import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AppSectionId } from "./AppSectionNav";

type AppPageSkeletonProps = {
    section?: AppSectionId;
};

const skeletonRows: Record<AppSectionId, number> = {
    overview: 4,
    security: 4,
    deployments: 5,
    domains: 3,
    environment: 4,
    logs: 8,
    metrics: 6,
    settings: 4,
};

export function AppPageSkeleton({ section = "overview" }: AppPageSkeletonProps) {
    const rows = skeletonRows[section];

    return (
        <Card aria-label={`${section} section loading`}>
            <CardHeader className="space-y-2">
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                <div className="h-4 w-64 max-w-full animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
                {Array.from({ length: rows }).map((_, index) => (
                    <div
                        key={index}
                        className="h-12 animate-pulse rounded-md border border-border/60 bg-muted/60"
                    />
                ))}
            </CardContent>
        </Card>
    );
}
