"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ServerCurrentMetrics = {
    cpu?: {
        percent?: number;
        perCore?: Array<{ core: string; user: number; system: number; iowait: number; idle: number }>;
    };
    disk?: {
        perDisk?: Array<{ device: string; readIops: number; writeIops: number; readBytesPerSec: number; writeBytesPerSec: number }>;
    };
    network?: {
        interfaces?: Array<{ name: string; rxBytes: number; txBytes: number; rxPackets: number; txPackets: number }>;
    };
};

export function ServerObservabilityPanel({ serverId }: { serverId: string }) {
    const { data } = useQuery({
        queryKey: ["serverMetricsCurrent", serverId],
        queryFn: async () => {
            const response = await fetch(`${API_URL}/metrics/${serverId}/current`, {
                credentials: "include",
            });
            if (!response.ok) {
                throw new Error("Failed to load server metrics");
            }
            return response.json() as Promise<ServerCurrentMetrics>;
        },
        refetchInterval: 30_000,
    });

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Per-Core CPU</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {(data?.cpu?.perCore || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No per-core samples yet.</p>
                    ) : (
                        data?.cpu?.perCore?.map((core) => (
                            <div key={core.core} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-foreground">{core.core}</span>
                                    <span className="text-muted-foreground">{(core.user + core.system + core.iowait).toFixed(1)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-secondary">
                                    <div
                                        className="h-2 rounded-full bg-primary"
                                        style={{ width: `${Math.min(100, core.user + core.system + core.iowait)}%` }}
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Disk I/O</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {(data?.disk?.perDisk || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No disk I/O samples yet.</p>
                    ) : (
                        data?.disk?.perDisk?.map((disk) => (
                            <div key={disk.device} className="rounded-lg border border-border/70 p-3">
                                <p className="font-medium text-foreground">{disk.device}</p>
                                <p className="text-sm text-muted-foreground">
                                    Read {disk.readIops} IOPS · Write {disk.writeIops} IOPS
                                </p>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Network Interfaces</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {(data?.network?.interfaces || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No interface counters yet.</p>
                    ) : (
                        data?.network?.interfaces?.map((iface) => (
                            <div key={iface.name} className="rounded-lg border border-border/70 p-3">
                                <p className="font-medium text-foreground">{iface.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    RX {Math.round(iface.rxBytes / 1024)} KB · TX {Math.round(iface.txBytes / 1024)} KB
                                </p>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
