"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type BuildpackVersionSelectorProps = {
    serverId: string;
    appId: string;
    buildpackVersion: string | null;
    buildpackVersionPin: string | null;
    disabled?: boolean;
};

export function BuildpackVersionSelector({
    serverId,
    appId,
    buildpackVersion,
    buildpackVersionPin,
    disabled = false,
}: BuildpackVersionSelectorProps) {
    const queryClient = useQueryClient();

    const { data: versionData, isLoading: versionsLoading } = useQuery({
        queryKey: ["buildpackVersions", serverId, appId],
        queryFn: () => api.listBuildpackVersions(serverId, appId),
        enabled: !!serverId && !!appId,
    });

    const pinMutation = useMutation({
        mutationFn: (version: string | null) =>
            api.updateBuildpackPin(serverId, appId, version),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["app", appId] });
            toast.success("Buildpack version pin updated");
        },
        onError: (error) => {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to update buildpack version pin"
            );
        },
    });

    const versions = versionData?.versions ?? [];
    const currentPin = buildpackVersionPin ?? "";

    const handlePinChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        pinMutation.mutate(value === "" ? null : value);
    };

    return (
        <div className="grid gap-4 md:grid-cols-3" data-testid="buildpack-version-selector">
            <div>
                <Label>Buildpack Version</Label>
                <div className="mt-2 flex items-center gap-2">
                    {buildpackVersion ? (
                        <Badge variant="outline" className="text-sm">
                            {buildpackVersion}
                        </Badge>
                    ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                    )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    The buildpack version used in the last successful deploy.
                </p>
            </div>
            <div>
                <Label htmlFor="buildpackVersionPin">Pin version</Label>
                <div className="relative mt-2">
                    <select
                        id="buildpackVersionPin"
                        data-testid="buildpack-pin-select"
                        value={currentPin}
                        onChange={handlePinChange}
                        disabled={disabled || versionsLoading || pinMutation.isPending}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                        <option value="">Use latest</option>
                        {versions.map((version) => (
                            <option key={version} value={version}>
                                {version}
                            </option>
                        ))}
                    </select>
                    {(versionsLoading || pinMutation.isPending) && (
                        <Loader2 className="absolute right-8 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    Pin to a specific version to prevent automatic upgrades. Select &quot;Use latest&quot; to always use the newest version.
                </p>
            </div>
        </div>
    );
}
