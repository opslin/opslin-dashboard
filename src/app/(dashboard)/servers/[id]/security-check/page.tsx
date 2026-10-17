"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { ServerCheckHeader, ServerCheckPage } from "@/components/servers/security-check/server-check-page";
import { api } from "@/lib/api";

export default function ServerSecurityCheckPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const server = useQuery({ queryKey: ["server", id], queryFn: () => api.getServer(id) });
    const online = server.data ? (server.data.isLiveConnected ?? server.data.status === "connected") : null;
    return (
        <div className="mx-auto w-full max-w-3xl space-y-5 px-1 pb-10">
            <ServerCheckHeader serverId={id} serverName={server.data?.name ?? null} />
            <ServerCheckPage serverId={id} serverName={server.data?.name ?? null} serverOnline={online} />
        </div>
    );
}
