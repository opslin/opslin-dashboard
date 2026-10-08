"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Globe, RotateCw, Shield, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FirewallAttackMap } from "@/components/servers/firewall-attack-map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, ApiRequestError, type FirewallAttackWindow } from "@/lib/api";
import { cn } from "@/lib/utils";

function Pill({ tone, children }: { tone: "success" | "warning" | "neutral"; children: React.ReactNode }) {
    return (
        <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tone === "success" && "bg-success-muted text-success-text", tone === "warning" && "bg-warning-muted text-warning-text", tone === "neutral" && "bg-muted text-muted-foreground")}>
            <span className={cn("size-1.5 rounded-full", tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-muted-foreground")} aria-hidden="true" />
            {children}
        </span>
    );
}

export function SecurityTab({ serverId }: { serverId: string }) {
    const queryClient = useQueryClient();
    const [window, setWindow] = useState<FirewallAttackWindow>("24h");
    const { data: state } = useQuery({ queryKey: ["firewall-state", serverId], queryFn: () => api.getFirewallState(serverId), refetchInterval: 30_000 });
    const { data: attacks } = useQuery({ queryKey: ["firewall-attacks", serverId, window], queryFn: () => api.getFirewallAttacks(serverId, window), refetchInterval: 30_000 });

    const secure = useMutation({
        mutationFn: () => api.applyFirewall(serverId, { profile: "WEB", sshCidrs: ["0.0.0.0/0"], monitoringIps: ["127.0.0.1/32"], customRules: [] }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["firewall-state", serverId] });
            toast.success("Securing server. The firewall change is queued.");
        },
        onError: (error) => toast.error(error instanceof ApiRequestError && error.details.message ? error.details.message : "Couldn't secure this server"),
    });

    const commits = state?.commits ?? [];
    const active = commits.find((c) => c.status === "active" || c.status === "pending_confirmation");
    const pending = commits.some((c) => c.status === "pending_apply" || c.status === "pending_confirmation");
    const protectedNow = Boolean(active);
    const cloudflare = Boolean(state?.cloudflare);
    const sources = attacks?.sources ?? [];
    const ports = attacks?.ports ?? [];
    const countries = attacks?.countries ?? [];

    return (
        <div className="space-y-5">
            <Card className="rounded-2xl shadow-xs">
                <div className="grid gap-6 px-6 py-2 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="flex items-start gap-4">
                        <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl", protectedNow ? "bg-success-muted text-success-text" : "bg-warning-muted text-warning-text")}>
                            {protectedNow ? <ShieldCheck className="size-7" aria-hidden="true" /> : <Shield className="size-7" aria-hidden="true" />}
                        </span>
                        <div>
                            <p className={cn("text-xs font-semibold uppercase tracking-wide", protectedNow ? "text-success-text" : "text-warning-text")}>{protectedNow ? "Protected" : "Action recommended"}</p>
                            <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{protectedNow ? "Your server is protected" : "Your server is not protected yet"}</h2>
                            <p className="mt-2 max-w-xl text-muted-foreground">
                                {protectedNow
                                    ? "A firewall is active. Only SSH and web ports are open."
                                    : "Turn on a safe firewall (SSH and web ports only). If something breaks, Opslin rolls back automatically within 5 minutes."}
                            </p>
                            <div className="mt-4 flex flex-wrap items-center gap-4">
                                {!protectedNow ? (
                                    <Button className="bg-success text-success-foreground hover:bg-success/90" disabled={secure.isPending || pending} onClick={() => secure.mutate()}>
                                        <ShieldCheck aria-hidden="true" /> {secure.isPending || pending ? "Securing…" : "Secure this server"}
                                    </Button>
                                ) : null}
                                <Link href={`/servers/${serverId}/security`} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                                    Advanced settings <ArrowRight className="size-4" aria-hidden="true" />
                                </Link>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-xl border bg-muted/30 p-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Security status</p>
                        <ul className="space-y-3 text-sm">
                            <li className="flex items-center gap-3"><Shield className="size-4 text-muted-foreground" aria-hidden="true" /><span>Firewall</span><span className="ml-auto"><Pill tone={protectedNow ? "success" : "warning"}>{protectedNow ? "On" : "Off"}</Pill></span></li>
                            <li className="flex items-center gap-3"><Globe className="size-4 text-muted-foreground" aria-hidden="true" /><span>Cloudflare</span><span className="ml-auto"><Pill tone={cloudflare ? "success" : "neutral"}>{cloudflare ? "Connected" : "Not linked"}</Pill></span></li>
                            <li className="flex items-center gap-3"><RotateCw className="size-4 text-muted-foreground" aria-hidden="true" /><span>Auto-revert</span><span className="ml-auto"><Pill tone="success">Ready</Pill></span></li>
                        </ul>
                    </div>
                </div>
            </Card>

            <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
                <div className="flex items-start justify-between gap-3 px-5 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Attack activity</h2>
                        <p className="text-sm text-muted-foreground">Recent connection attempts and firewall events</p>
                    </div>
                    <ToggleGroup value={window} onValueChange={(v) => setWindow(v as FirewallAttackWindow)}>
                        {(["1h", "24h", "7d"] as const).map((w) => (
                            <ToggleGroupItem key={w} value={w} aria-label={w}>{w}</ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </div>
                <div className="grid gap-4 border-t p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="rounded-xl border p-3">
                        <FirewallAttackMap countries={countries} />
                        <p className="mt-2 text-xs text-muted-foreground">{countries.length === 0 ? "No attack telemetry recorded yet." : `${countries.length} active ${countries.length === 1 ? "country" : "countries"} · connection attempts by origin`}</p>
                    </div>
                    <div className="space-y-4">
                        <div className="rounded-xl border p-4">
                            <h3 className="mb-3 text-sm font-semibold text-foreground">Top sources</h3>
                            {sources.length === 0 ? <p className="text-sm text-muted-foreground">No sources detected</p> : (
                                <ul className="space-y-2 text-sm">
                                    {sources.slice(0, 5).map((s) => (
                                        <li key={`${s.src_ip_text}-${s.country}`} className="flex items-center gap-2"><span className="w-7 text-xs text-muted-foreground">{s.country}</span><span className="flex-1 truncate font-mono text-xs">{s.src_ip_text}</span><span className="font-semibold">{s.count}</span></li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="rounded-xl border p-4">
                            <h3 className="mb-3 text-sm font-semibold text-foreground">Targeted ports</h3>
                            {ports.length === 0 ? <p className="text-sm text-muted-foreground">No targeted ports</p> : (
                                <ul className="space-y-2 text-sm">
                                    {ports.slice(0, 5).map((p) => (
                                        <li key={`${p.port}-${p.proto}`} className="flex items-center gap-2"><span className="flex-1 font-mono text-xs">{p.port} / {p.proto.toUpperCase()}</span><span className="font-semibold">{p.count}</span></li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
