"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { ConnectedCard } from "./install-progress";
import { ConnectStepper, INSTALL_COMMANDS, PROVIDERS, ProviderTile } from "./shared";

const FIXES = [
    "Make sure you pasted the whole command, including the part after the pipe.",
    "Run it as root, or put sudo in front of the command.",
    "Your server needs outbound internet access (port 443).",
    "Still stuck? Connect with a password instead and Opslin will handle it.",
];

export function CommandMethod({ onBack, onUsePassword }: { onBack: () => void; onUsePassword: () => void }) {
    const [target, setTarget] = useState<"linux" | "local">("linux");
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

    const command = INSTALL_COMMANDS[target];
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
                                    <code data-testid="install-command" className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm">{INSTALL_COMMANDS[value]}</code>
                                    <Button type="button" size="sm" variant="secondary" onClick={() => void copy()}>
                                        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                                        {copied ? "Copied!" : "Copy"}
                                    </Button>
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>

                    <ol className="space-y-3 text-sm text-muted-foreground">
                        {["Open your provider's web console (or SSH in).", "Paste the command and press Enter.", "Come back here. This page updates by itself."].map((step, index) => (
                            <li key={step} className="flex items-start gap-3">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                                <span className="pt-0.5">{step}</span>
                            </li>
                        ))}
                    </ol>

                    <ul className="flex flex-wrap gap-2" aria-label="Where to open the console">
                        {PROVIDERS.filter((provider) => provider.consoleUrl).slice(0, 5).map((provider) => (
                            <li key={provider.id}>
                                <a href={provider.consoleUrl ?? undefined} target="_blank" rel="noreferrer" title={provider.terminalHint} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
                                    <ProviderTile provider={provider} className="size-5 text-[10px]" />
                                    {provider.label}
                                    <ExternalLink className="size-3 text-muted-foreground" aria-hidden="true" />
                                </a>
                            </li>
                        ))}
                    </ul>

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
                                {FIXES.map((fix) => (
                                    <li key={fix}>{fix}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>

                    <p className="text-center text-sm">
                        <button type="button" onClick={onUsePassword} className="font-medium text-primary underline-offset-4 hover:underline">
                            Connect with a password instead
                        </button>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
