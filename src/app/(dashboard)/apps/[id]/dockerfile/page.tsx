"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileCode2, Loader2, Save } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

const DockerfileMonaco = dynamic(
    () => import("@/components/apps/dockerfile-monaco").then((mod) => mod.DockerfileMonaco),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-[60vh] min-h-[420px] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
                Loading editor...
            </div>
        ),
    }
);

export default function DockerfileOverridePage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const appId = params.id as string;
    const [contentDraft, setContentDraft] = useState<string | null>(null);

    const { data: servers = [] } = useQuery({
        queryKey: ["servers"],
        queryFn: () => api.getServers(),
    });

    const { data: appData, isLoading } = useQuery({
        queryKey: ["app", appId],
        queryFn: async () => {
            for (const server of servers) {
                const apps = await api.getApps(server.id).catch(() => []);
                const app = apps.find((entry) => entry.id === appId);
                if (app) {
                    return { app, server };
                }
            }
            return null;
        },
        enabled: servers.length > 0,
    });

    const dockerfileQuery = useQuery({
        queryKey: ["appDockerfile", appId],
        queryFn: async () => {
            if (!appData) {
                return null;
            }
            return api.getDockerfileOverride(appData.server.id, appId);
        },
        enabled: !!appData,
    });

    const content = contentDraft ?? dockerfileQuery.data?.content ?? "";

    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!appData) {
                throw new Error("App not found");
            }
            return api.updateDockerfileOverride(appData.server.id, appId, content);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["app", appId] });
            queryClient.invalidateQueries({ queryKey: ["appDockerfile", appId] });
            router.push(`/apps/${appId}`);
        },
    });

    const isDirty = useMemo(
        () => content !== (dockerfileQuery.data?.content ?? ""),
        [content, dockerfileQuery.data?.content]
    );

    if (isLoading || dockerfileQuery.isLoading) {
        return (
            <>
                <Header title="Dockerfile Override" description="Loading application configuration" />
                <div className="p-6">
                    <div className="h-[60vh] animate-pulse rounded-xl bg-muted" />
                </div>
            </>
        );
    }

    if (!appData) {
        return (
            <>
                <Header title="Dockerfile Override" description="Application not found" />
                <div className="p-6">
                    <Card className="mx-auto max-w-xl">
                        <CardContent className="pt-6 text-center">
                            <p className="text-muted-foreground">This application could not be found.</p>
                            <Button asChild className="mt-4">
                                <Link href="/apps">Back to Apps</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </>
        );
    }

    return (
        <>
            <Header
                title={`${appData.app.name} Dockerfile`}
                description="Override the generated Dockerfile with a custom build definition."
                actions={
                    <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending || !isDirty}
                    >
                        {saveMutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving
                            </>
                        ) : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save Override
                            </>
                        )}
                    </Button>
                }
            />

            <div className="space-y-6 p-6">
                <Button variant="ghost" asChild>
                    <Link href={`/apps/${appId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to App
                    </Link>
                </Button>

                <Card elevation="raised">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileCode2 className="h-5 w-5 text-muted-foreground" />
                            Dockerfile Override
                        </CardTitle>
                        <CardDescription>
                            This editor is lazy-loaded and stored per app. Leaving it empty reverts to generated buildpacks.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <DockerfileMonaco value={content} onChange={setContentDraft} />
                        {saveMutation.error && (
                            <div className="rounded-lg bg-danger-muted px-4 py-3 text-sm text-danger-text">
                                {(saveMutation.error as Error).message}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
