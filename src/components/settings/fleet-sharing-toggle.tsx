"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import Link from "next/link";
import { api } from "@/lib/api";

/**
 * FIS Phase 1 (docs/audit/07_FIS_DESIGN.md) fleet-pattern sharing opt-in/out.
 * Opted OUT by default — enabling this only lets bucketed, k-anonymous
 * (k>=5) failure-signature data contribute to fleet-wide FleetPattern rows;
 * see the Transparency page for the full methodology. OWNER-only to change.
 */
export function FleetSharingToggle({ orgRole }: { orgRole?: string | null }) {
    const queryClient = useQueryClient();
    const isOwner = orgRole === "OWNER";

    const { data, isLoading } = useQuery({
        queryKey: ["fis", "fleet-sharing"],
        queryFn: () => api.getFleetSharingOptIn(),
    });

    const mutation = useMutation({
        mutationFn: (enabled: boolean) => api.setFleetSharingOptIn(enabled),
        onSuccess: (result) => {
            queryClient.setQueryData(["fis", "fleet-sharing"], result);
            toast.success(result.enabled ? "Fleet-pattern sharing enabled" : "Fleet-pattern sharing disabled");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to update this setting");
        },
    });

    const enabled = Boolean(data?.enabled);

    return (
        <Card className="border-border/80 shadow-sm">
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Share2 className="size-5" />
                        </div>
                        <div>
                            <CardTitle>Fleet-Pattern Sharing</CardTitle>
                            <CardDescription>
                                Let anonymized deploy-failure patterns help warn other Opslin customers before they hit
                                the same issue.
                            </CardDescription>
                        </div>
                    </div>
                    <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "Enabled" : "Disabled"}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-secondary/30 p-4">
                    <div className="min-w-0 space-y-1">
                        <p className="font-medium text-foreground">Share failure patterns with the fleet</p>
                        <p className="text-sm text-muted-foreground">
                            Only bucketed context (never secrets, hostnames, or raw values) is shared, and only once at
                            least 5 organizations report the same pattern.
                        </p>
                    </div>
                    <Switch
                        checked={enabled}
                        disabled={isLoading || !isOwner || mutation.isPending}
                        onCheckedChange={(checked) => mutation.mutate(checked)}
                        aria-label="Toggle fleet-pattern sharing"
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    {isOwner ? (
                        <>
                            Read the full methodology on the{" "}
                            <Link href="/transparency#fis-methodology" className="text-info-text hover:text-info/80 font-medium">
                                Transparency page
                            </Link>
                            .
                        </>
                    ) : (
                        "Only an organization owner can change this setting."
                    )}
                </p>
            </CardContent>
        </Card>
    );
}
