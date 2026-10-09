"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Info, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type Server } from "@/lib/api";
import { countCrossings, type ChartPoint } from "./lib";

const RESOURCES = [
    { id: "cpu", label: "CPU", supported: true },
    { id: "memory", label: "Memory (coming soon)", supported: false },
    { id: "disk", label: "Disk (coming soon)", supported: false },
] as const;

const DURATIONS = [
    { value: "60", label: "1 minute" },
    { value: "300", label: "5 minutes" },
    { value: "900", label: "15 minutes" },
];

export function CreateAlertDialog({ open, onOpenChange, servers, defaultServerId, points, rangeText }: { open: boolean; onOpenChange: (open: boolean) => void; servers: Server[]; defaultServerId: string; points: ChartPoint[]; rangeText: string }) {
    const queryClient = useQueryClient();
    const [threshold, setThreshold] = useState("85");
    const [duration, setDuration] = useState("300");
    const [serverId, setServerId] = useState(defaultServerId);

    const limit = Math.min(100, Math.max(1, Number(threshold) || 0));
    const fired = useMemo(() => countCrossings(points.map((p) => p.cpu), limit), [points, limit]);

    const create = useMutation({
        mutationFn: () => api.createAlertRule({ serverId: serverId || undefined, metric: "cpu_percent", operator: "GT", threshold: limit, durationSec: Number(duration), severity: "WARN", channels: [], enabled: true }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
            toast.success("Alert created");
            onOpenChange(false);
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create the alert"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-2xl p-6">
                <DialogHeader className="flex-row items-start gap-3 text-left">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bell className="size-5" aria-hidden="true" /></span>
                    <div>
                        <DialogTitle className="text-lg font-bold">Alert me when…</DialogTitle>
                        <DialogDescription>We&apos;ll watch this resource for you.</DialogDescription>
                    </div>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="alert-resource">Resource</Label>
                        <Select value="cpu">
                            <SelectTrigger id="alert-resource" className="h-10 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {RESOURCES.map((item) => (
                                    <SelectItem key={item.id} value={item.id} disabled={!item.supported}>{item.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {servers.length > 1 ? (
                        <div className="space-y-1.5">
                            <Label htmlFor="alert-server">Server</Label>
                            <Select value={serverId} onValueChange={setServerId}>
                                <SelectTrigger id="alert-server" className="h-10 w-full"><SelectValue placeholder="Choose a server" /></SelectTrigger>
                                <SelectContent>
                                    {servers.map((server) => (
                                        <SelectItem key={server.id} value={server.id}>{server.name || server.hostname || server.ip}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="alert-condition">Condition</Label>
                            <Select value="above">
                                <SelectTrigger id="alert-condition" className="h-10 w-full"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="above">is above</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="alert-threshold">Threshold (%)</Label>
                            <Input id="alert-threshold" inputMode="numeric" value={threshold} onChange={(event) => setThreshold(event.target.value.replace(/[^0-9]/g, ""))} className="h-10" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="alert-duration">For at least</Label>
                        <Select value={duration} onValueChange={setDuration}>
                            <SelectTrigger id="alert-duration" className="h-10 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {DURATIONS.map((item) => (
                                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5 text-sm">
                        <p className="font-medium text-foreground">Notify me by</p>
                        <p className="text-muted-foreground">The alert always shows in Opslin. <Link href="/alerts" className="font-medium text-primary hover:underline">Add email or Slack in Alerts</Link></p>
                    </div>
                    <p className="flex items-start gap-2 rounded-xl bg-info-muted px-4 py-3 text-sm text-info-text"><Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />This would have fired {fired} {fired === 1 ? "time" : "times"} in {rangeText}.</p>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => create.mutate()} disabled={create.isPending || limit < 1 || !serverId}><Plus aria-hidden="true" />{create.isPending ? "Creating" : "Create alert"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
