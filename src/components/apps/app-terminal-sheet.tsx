"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { TerminalStatus } from "@/components/terminal/xterm-terminal";

const XTermTerminal = dynamic(() => import("@/components/terminal/xterm-terminal").then((mod) => mod.XTermTerminal), { ssr: false });

const STATE_LABEL: Record<TerminalStatus["state"], string> = {
    connecting: "Connecting",
    connected: "Connected",
    reconnecting: "Reconnecting",
    disconnected: "Closed",
    error: "Could not connect",
};

/**
 * A shell inside the app's own container (docs/audit/58, A3). It opens when the panel opens and ends when it closes; a
 * closed or refused session is not reopened by itself (the reason is written in the terminal), so a shell never starts
 * without the person asking. Only the organization owner is let in; the API says why when someone else tries.
 */
export function AppTerminalSheet({ serverId, appId, appName, open, onOpenChange }: {
    serverId: string;
    appId: string;
    appName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [status, setStatus] = useState<TerminalStatus>({ state: "connecting" });
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="h-[75vh] gap-0 p-0 sm:max-w-none">
                <SheetHeader className="flex-row items-center justify-between gap-3 border-b border-border/70 px-5 py-3 pr-12">
                    <SheetTitle className="truncate text-base">Terminal in {appName}</SheetTitle>
                    <SheetDescription className="shrink-0 text-sm" role="status">{STATE_LABEL[status.state]}</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1">
                    {open ? <XTermTerminal serverId={serverId} appId={appId} autoReconnect={false} onStatusChange={setStatus} /> : null}
                </div>
            </SheetContent>
        </Sheet>
    );
}
