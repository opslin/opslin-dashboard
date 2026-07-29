"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, Loader2, Shield, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { removeToken } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

function redirectToLogin(router: ReturnType<typeof useRouter>) {
    removeToken();
    router.push("/login");
}

export function SessionManager() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: sessions = [], isLoading } = useQuery({
        queryKey: ["auth-sessions"],
        queryFn: () => api.getSessions(),
    });

    const revokeSessionMutation = useMutation({
        mutationFn: (sessionId: string) => api.revokeSession(sessionId),
        onSuccess: async (result) => {
            if (result.revokedCurrentSession) {
                redirectToLogin(router);
                return;
            }
            await queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
        },
    });

    const revokeAllMutation = useMutation({
        mutationFn: () => api.revokeAllSessions(),
        onSuccess: () => {
            redirectToLogin(router);
        },
    });

    return (
        <Card data-testid="session-manager" className="border-border/80 shadow-sm">
            <CardHeader className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Laptop className="size-5" />
                    </div>
                    <div>
                        <CardTitle>Active Sessions</CardTitle>
                        <CardDescription>
                            Review where your account is signed in and revoke any session you do not trust.
                        </CardDescription>
                    </div>
                </div>
                <Button
                    variant="outline"
                    onClick={() => revokeAllMutation.mutate()}
                    disabled={revokeAllMutation.isPending || sessions.length === 0}
                    data-testid="revoke-all-sessions"
                    className="w-full sm:w-fit"
                >
                    {revokeAllMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Log out all devices
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                {isLoading ? (
                    <div className="space-y-2">
                        <div className="h-20 animate-pulse rounded-xl bg-muted" />
                        <div className="h-20 animate-pulse rounded-xl bg-muted" />
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-6 text-center">
                        <Shield className="mx-auto size-5 text-muted-foreground" />
                        <p className="mt-2 text-sm font-medium text-foreground">No active sessions found.</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            New sessions will appear here after sign-in.
                        </p>
                    </div>
                ) : (
                    sessions.map((session) => (
                        <div
                            key={session.id}
                            className="flex flex-col gap-3 rounded-xl border border-border/70 bg-secondary/20 p-4 md:flex-row md:items-center md:justify-between"
                            data-testid={`session-row-${session.id}`}
                        >
                            <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Laptop className="h-4 w-4 text-primary" />
                                    <p className="truncate font-medium text-foreground">{session.device}</p>
                                    {session.isCurrent && (
                                        // Solid fill, not the translucent -muted/-text pair: this
                                        // badge nests inside the row's own translucent bg-secondary/20,
                                        // and stacking two translucent layers eroded the already-marginal
                                        // success-text/success-muted contrast below AA (R6, found via axe).
                                        <Badge variant="secondary" className="bg-success text-success-foreground">
                                            Current
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                    <span>{session.ip}</span>
                                    <span>Active {formatRelativeTime(session.lastActive)}</span>
                                    <span>Signed in {formatRelativeTime(session.createdAt)}</span>
                                </div>
                            </div>
                            <Button
                                variant={session.isCurrent ? "destructive" : "outline"}
                                onClick={() => revokeSessionMutation.mutate(session.id)}
                                disabled={revokeSessionMutation.isPending}
                                data-testid={`revoke-session-${session.id}`}
                                className="w-full md:w-fit"
                            >
                                {revokeSessionMutation.isPending && revokeSessionMutation.variables === session.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Shield className="mr-2 h-4 w-4" />
                                )}
                                {session.isCurrent ? "Log out" : "Revoke"}
                            </Button>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
