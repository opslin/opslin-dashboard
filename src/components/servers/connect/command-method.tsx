"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { ConnectedCard } from "./install-progress";
import { ConnectStepper, INSTALL_COMMANDS, INSTALL_COMMAND_SUDO, needsSudo, PROVIDERS, type ProviderId, ProviderTile, sshInstallAvailable, sshLine } from "./shared";

export function CommandMethod({ onBack, onUsePassword }: { onBack: () => void; onUsePassword: () => void }) {
    const [target, setTarget] = useState<"linux" | "local">("linux");
    const [providerId, setProviderId] = useState<ProviderId>("other");
    const provider = PROVIDERS.find((entry) => entry.id === providerId) ?? PROVIDERS[PROVIDERS.length - 1];
    const sudo = needsSudo(provider);
    const passwordAvailable = sshInstallAvailable();
    const fixes = [
        "Make sure you pasted the whole command, including the part after the pipe.",
        "Not logged in as root? End the command with | sudo sh instead of | sh.",
        "Your server needs outbound internet access (port 443).",
        passwordAvailable ? "Still stuck? Connect with a password instead and Opslin will handle it." : "Still stuck? Check the steps for your provider on the right.",
    ];
    const [copied, setCopied] = useState(false);
    const [showFixes, setShowFixes] = useState(false);
    // Servers that were already live before this page opened don't count as "the new one".
    const [startedAt] = useState(() => Date.now());

    const { data: servers = [] } = useQuery({
        queryKey: ["servers"],
        queryFn: () => api.getServers(),
        refetchInterval: 4000,
    });
    const connected = servers.find((server) => server.isLiveConnected && server.connectedAt && new Date(server.connectedAt).getTime() >= startedAt - 5000);

    if (connected) {
        const detail = [connected.publicIp || connected.ip, connected.os].filter(Boolean).join(" · ");
        return <ConnectedCard name={connected.name || "Your server"} detail={detail} />;
    }

    const commands = { linux: sudo ? INSTALL_COMMAND_SUDO : INSTALL_COMMANDS.linux, local: INSTALL_COMMANDS.local };
    const command = commands[target];
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className="space-y-8">
            <ConnectStepper step={2} />
            <div className="space-y-3 text-center">
                <h1 className="text-4xl font-bold tracking-tight text-foreground">Run this on your server</h1>
                <p className="text-lg text-muted-foreground">Paste one command. Opslin connects automatically.</p>
            </div>

            <Card className="mx-auto max-w-2xl gap-0 py-0">
                <CardContent className="space-y-5 p-6">
                    <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        Back
                    </button>

                    <Tabs value={target} onValueChange={(value) => setTarget(value as "linux" | "local")}>
                        <TabsList variant="line">
                            <TabsTrigger value="linux">Linux server</TabsTrigger>
                            <TabsTrigger value="local">Local machine</TabsTrigger>
                        </TabsList>
                        {(["linux", "local"] as const).map((value) => (
                            <TabsContent key={value} value={value} className="pt-4">
                                <div className="flex items-center gap-3 rounded-xl bg-foreground px-4 py-3 text-background">
                                    <code data-testid="install-command" className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm">{commands[value]}</code>
                                    <Button type="button" size="sm" variant="secondary" onClick={() => void copy()}>
                                        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                                        {copied ? "Copied!" : "Copy"}
                                    </Button>
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>

                    <div className="flex items-center justify-between gap-3 border-t pt-4">
                        <span id="command-provider-label" className="text-sm font-medium text-foreground">Where is your server?</span>
                        <Select value={providerId} onValueChange={(value) => setProviderId(value as ProviderId)}>
                            <SelectTrigger className="w-48" aria-labelledby="command-provider-label">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PROVIDERS.map((entry) => (
                                    <SelectItem key={entry.id} value={entry.id}>
                                        <span className="flex items-center gap-2">
                                            <ProviderTile provider={entry} className="size-5 text-[10px]" />
                                            {entry.label}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <ol className="space-y-3 text-sm text-muted-foreground">
                        {[`Open a terminal on the server: ${provider.terminalHint}.`, "Paste the command and press Enter.", "Come back here. This page updates by itself."].map((step, index) => (
                            <li key={step} className="flex items-start gap-3">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                                <span className="pt-0.5">{step}</span>
                            </li>
                        ))}
                    </ol>

                    {provider.consoleUrl ? (
                        <Button asChild variant="outline" className="w-full">
                            <a href={provider.consoleUrl} target="_blank" rel="noreferrer">
                                {provider.consoleLabel}
                                <ExternalLink aria-hidden="true" />
                            </a>
                        </Button>
                    ) : null}

                    <div className="space-y-1.5 rounded-xl bg-muted px-4 py-3 text-sm">
                        <p className="font-medium text-foreground">No web console?</p>
                        <p className="text-muted-foreground">Open Terminal on your own computer, log in, then paste the command.</p>
                        <code data-testid="ssh-line" className="block overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">{sshLine(provider)}</code>
                        {provider.keyOnly ? <p className="text-muted-foreground">{provider.label} has no password. Use the key file from when you created the server.</p> : null}
                    </div>

                    <div role="status" className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3 text-sm">
                        <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                        <div>
                            <p className="font-medium text-foreground">Waiting for your server to connect…</p>
                            <p className="text-muted-foreground">Usually under a minute after you run the command.</p>
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <button type="button" aria-expanded={showFixes} onClick={() => setShowFixes((value) => !value)} className="flex w-full items-center justify-between text-sm font-medium text-foreground">
                            Not working? Common fixes
                            <ChevronDown className={`size-4 transition-transform ${showFixes ? "rotate-180" : ""}`} aria-hidden="true" />
                        </button>
                        {showFixes ? (
                            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                                {fixes.map((fix) => (
                                    <li key={fix}>{fix}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>

                    {passwordAvailable ? (
                        <p className="text-center text-sm">
                            <button type="button" onClick={onUsePassword} className="font-medium text-primary underline-offset-4 hover:underline">
                                Connect with a password instead
                            </button>
                        </p>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
