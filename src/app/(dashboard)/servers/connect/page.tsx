"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { AwsForm } from "@/components/servers/connect/aws-form";
import { ChooseMethod } from "@/components/servers/connect/choose-method";
import { CommandMethod } from "@/components/servers/connect/command-method";
import { InstallProgress } from "@/components/servers/connect/install-progress";
import { PROVIDERS, ProviderTile, sshInstallAvailable } from "@/components/servers/connect/shared";
import { SshForm, type SshStart } from "@/components/servers/connect/ssh-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

type View = "choose" | "ssh" | "command" | "guide" | "aws" | "installing";

function Guide({ onBack, onChoose }: { onBack: () => void; onChoose: (view: View) => void }) {
    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="text-4xl font-bold tracking-tight text-foreground">Where do I find my details?</h1>
                <p className="text-lg text-muted-foreground">You need your server&apos;s IP address and a way to open its terminal.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                {PROVIDERS.filter((provider) => provider.id !== "other").map((provider) => (
                    <Card key={provider.id} className="gap-0 py-0">
                        <CardContent className="space-y-3 p-5">
                            <h2 className="flex items-center gap-2 font-semibold text-foreground">
                                <ProviderTile provider={provider} />
                                {provider.label}
                            </h2>
                            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                {provider.steps.slice(0, 3).map((step) => (
                                    <li key={step}>{step.replace(/\*\*/g, "")}</li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={onBack}>Back</Button>
                {sshInstallAvailable() ? <Button onClick={() => onChoose("ssh")}>Connect with password or SSH key</Button> : <Button onClick={() => onChoose("command")}>Run one command</Button>}
            </div>
        </div>
    );
}

function ConnectServer() {
    const params = useSearchParams();
    const repairId = params.get("repair");
    const repair = repairId ? { serverId: repairId, name: params.get("name") || "your server" } : undefined;
    const [view, setView] = useState<View>(repair ? "ssh" : "choose");
    const [start, setStart] = useState<SshStart | null>(null);

    return (
        <>
            <Header title={repair ? "Reconnect server" : "Add server"} description={repair ? "Log in once to repair the Opslin agent." : "Connect a VPS so Opslin can deploy to it."} />
            <div className="dashboard-page mx-auto w-full max-w-5xl py-8">
                {view === "choose" ? <ChooseMethod onChoose={setView} /> : null}
                {view === "ssh" && sshInstallAvailable() ? (
                    <SshForm
                        repair={repair}
                        onBack={() => (repair ? window.history.back() : setView("choose"))}
                        onUseCommand={() => setView("command")}
                        onStarted={(next) => {
                            setStart(next);
                            setView("installing");
                        }}
                    />
                ) : null}
                {view === "aws" ? (
                    <AwsForm
                        onBack={() => setView("choose")}
                        onUseCommand={() => setView("command")}
                        onStarted={(next) => {
                            setStart({ ...next, kind: "add" });
                            setView("installing");
                        }}
                    />
                ) : null}
                {view === "command" ? <CommandMethod onBack={() => setView("choose")} onUsePassword={() => setView("ssh")} /> : null}
                {view === "guide" ? <Guide onBack={() => setView("choose")} onChoose={setView} /> : null}
                {view === "installing" && start ? (
                    <InstallProgress
                        start={start}
                        onRetry={() => setView(start.username === "aws" ? "aws" : "ssh")}
                        fetchStatus={start.username === "aws" ? (jobId) => api.getCloudInstall(jobId) : undefined}
                    />
                ) : null}
            </div>
        </>
    );
}

export default function ConnectServerPage() {
    return (
        <Suspense fallback={null}>
            <ConnectServer />
        </Suspense>
    );
}
