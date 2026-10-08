"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { ChooseMethod } from "@/components/servers/connect/choose-method";
import { CommandMethod } from "@/components/servers/connect/command-method";
import { InstallProgress } from "@/components/servers/connect/install-progress";
import { PROVIDERS, ProviderTile } from "@/components/servers/connect/shared";
import { SshForm, type SshStart } from "@/components/servers/connect/ssh-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type View = "choose" | "ssh" | "command" | "guide" | "installing";

function Guide({ onBack, onChoose }: { onBack: () => void; onChoose: (view: View) => void }) {
    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="text-4xl font-bold tracking-tight text-foreground">Where do I find my details?</h1>
                <p className="text-lg text-muted-foreground">You need your server&apos;s IP address, username and password (or key).</p>
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
                <Button onClick={() => onChoose("ssh")}>Connect with password or SSH key</Button>
            </div>
        </div>
    );
}

export default function ConnectServerPage() {
    const [view, setView] = useState<View>("choose");
    const [start, setStart] = useState<SshStart | null>(null);

    return (
        <>
            <Header title="Add server" description="Connect a VPS so Opslin can deploy to it." />
            <div className="dashboard-page mx-auto w-full max-w-5xl py-8">
                {view === "choose" ? <ChooseMethod onChoose={setView} /> : null}
                {view === "ssh" ? (
                    <SshForm
                        onBack={() => setView("choose")}
                        onUseCommand={() => setView("command")}
                        onStarted={(next) => {
                            setStart(next);
                            setView("installing");
                        }}
                    />
                ) : null}
                {view === "command" ? <CommandMethod onBack={() => setView("choose")} onUsePassword={() => setView("ssh")} /> : null}
                {view === "guide" ? <Guide onBack={() => setView("choose")} onChoose={setView} /> : null}
                {view === "installing" && start ? <InstallProgress start={start} onRetry={() => setView("ssh")} /> : null}
            </div>
        </>
    );
}
