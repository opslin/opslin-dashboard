"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, CheckCircle2, Circle, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, type SshInstallPhase, type SshInstallStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ConnectStepper } from "./shared";
import type { SshStart } from "./ssh-form";

const PHASES: { id: SshInstallPhase; label: string }[] = [
    { id: "login", label: "Logging in securely" },
    { id: "check", label: "Checking your server" },
    { id: "docker", label: "Installing Docker" },
    { id: "agent", label: "Installing the Opslin agent" },
    { id: "connect", label: "Connecting back to Opslin" },
];

function phaseState(index: number, status: SshInstallStatus | undefined): "done" | "active" | "pending" {
    if (status?.status === "COMPLETED") return "done";
    const current = PHASES.findIndex((phase) => phase.id === status?.phase);
    const active = current === -1 ? 0 : current;
    if (index < active) return "done";
    return index === active ? "active" : "pending";
}

export function ConnectedCard({ name, detail, onDeploy }: { name: string; detail: string; onDeploy?: () => void }) {
    return (
        <div className="space-y-8">
            <ConnectStepper step={2} />
            <Card className="mx-auto max-w-xl gap-0 py-0">
                <CardContent className="space-y-5 p-8 text-center">
                    <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-muted text-success-text">
                        <CheckCircle2 className="size-8" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">{name} is connected</h1>
                        {detail ? <p className="text-muted-foreground">{detail}</p> : null}
                    </div>
                    <ul className="flex flex-wrap justify-center gap-2 text-sm">
                        {["Agent online", "Docker ready", "Secure connection"].map((chip) => (
                            <li key={chip} className="flex items-center gap-1.5 rounded-full bg-success-muted px-3 py-1 font-medium text-success-text">
                                <Check className="size-3.5" aria-hidden="true" />
                                {chip}
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-col justify-center gap-3 sm:flex-row">
                        <Button asChild onClick={onDeploy}>
                            <Link href="/apps/new">Deploy your first app</Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link href="/servers">Go to servers</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export function InstallProgress({ start, onRetry }: { start: SshStart; onRetry: () => void }) {
    const { data, error } = useQuery({
        queryKey: ["ssh-install", start.jobId],
        queryFn: () => api.getSshInstall(start.jobId),
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status === "COMPLETED" || status === "FAILED" ? false : 2000;
        },
    });

    if (data?.status === "COMPLETED") {
        const detail = [start.host, start.test?.os, start.test?.cpuCores ? `${start.test.cpuCores} vCPU` : null, start.test?.memoryMb ? `${Math.round(start.test.memoryMb / 1024)} GB RAM` : null].filter(Boolean).join(" · ");
        return <ConnectedCard name={start.host} detail={detail} />;
    }

    const failed = data?.status === "FAILED" || Boolean(error);
    const percent = Math.max(5, Math.min(100, data?.percent ?? 5));

    return (
        <div className="space-y-8">
            <ConnectStepper step={2} />
            <Card className="mx-auto max-w-xl gap-0 py-0">
                <CardContent className="space-y-6 p-8">
                    <div className="space-y-3">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">{failed ? "Something went wrong" : "Setting up your server..."}</h1>
                        {failed ? (
                            <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-danger-text">
                                <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                                <p>{data?.error || data?.message || "We couldn't finish the install. Check your login and try again."}</p>
                            </div>
                        ) : (
                            <>
                                <Progress value={percent} aria-label="Install progress" />
                                <p className="text-sm text-muted-foreground">{percent}% · About a minute left</p>
                            </>
                        )}
                    </div>

                    <ol className="space-y-4">
                        {PHASES.map((phase, index) => {
                            const state = failed && phaseState(index, data) === "active" ? "failed" : phaseState(index, data);
                            return (
                                <li key={phase.id} className="flex items-start gap-3" aria-current={state === "active" ? "step" : undefined}>
                                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center">
                                        {state === "done" ? <CheckCircle2 className="size-6 text-success-text" aria-hidden="true" /> : null}
                                        {state === "active" ? <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" /> : null}
                                        {state === "pending" ? <Circle className="size-5 text-muted-foreground/50" aria-hidden="true" /> : null}
                                        {state === "failed" ? <TriangleAlert className="size-5 text-danger-text" aria-hidden="true" /> : null}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className={cn("font-medium", state === "pending" ? "text-muted-foreground" : "text-foreground")}>{phase.label}</p>
                                        {state === "active" && data?.message ? (
                                            <p className="mt-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{data.message}</p>
                                        ) : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>

                    {failed ? (
                        <Button type="button" onClick={onRetry} className="w-full">Try again</Button>
                    ) : (
                        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <ShieldCheck className="size-4" aria-hidden="true" />
                            You can leave this page. We&apos;ll keep going.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
