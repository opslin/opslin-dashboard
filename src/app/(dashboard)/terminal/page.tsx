"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Terminal, Copy, ClipboardPaste, Trash2, Maximize2, Minimize2,
    Plus, Bookmark, Code2, X, Wifi, Shield, Zap, Clock, Cpu, Bot, Unplug
} from "lucide-react";
import dynamic from "next/dynamic";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Server } from "@/lib/api";
import { PlanGate } from "@/components/PlanGate";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import type { XTermTerminalHandle } from "@/components/terminal/xterm-terminal";

const XTermTerminal = dynamic(
    () => import("@/components/terminal/xterm-terminal").then((mod) => mod.XTermTerminal),
    { ssr: false }
);

function isServerLive(server: Server | undefined) {
    if (!server) return false;
    if (typeof server.isLiveConnected === "boolean") return server.isLiveConnected;
    return server.status === "connected";
}

interface TerminalSession {
    id: string;
    serverId: string;
    serverName: string;
    path: string;
}

interface QuickCommand {
    label: string;
    command: string;
    icon: string;
}

const QUICK_COMMANDS: QuickCommand[] = [
    { label: "System Update", command: "sudo apt update && sudo apt upgrade -y", icon: "installing-updates" },
    { label: "Disk Usage", command: "df -h", icon: "ssd" },
    { label: "Memory Usage", command: "free -h", icon: "memory-slot" },
    { label: "Process Monitor", command: "htop", icon: "processor" },
    { label: "Docker Status", command: "docker ps -a", icon: "docker" },
];

export default function TerminalPage() {
    const [selectedServer, setSelectedServer] = useState<string>("");
    const [sessions, setSessions] = useState<TerminalSession[]>([]);
    const [activeSession, setActiveSession] = useState<string>("");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [autoReconnect, setAutoReconnect] = useState(true);
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTermTerminalHandle>(null);

    const { data: servers = [] } = useQuery({
        queryKey: ["servers"],
        queryFn: () => api.getServers(),
        refetchInterval: 30_000,
    });

    const liveServers = servers.filter(isServerLive);
    const selectedServerData = servers.find((s) => s.id === selectedServer);
    const isSelectedServerLive = isServerLive(selectedServerData);

    // Auto-select first live server
    useEffect(() => {
        if (liveServers.length > 0 && !selectedServer) {
            const first = liveServers[0];
            setSelectedServer(first.id);
            const session: TerminalSession = {
                id: `session-${Date.now()}`,
                serverId: first.id,
                serverName: first.name || first.hostname || first.ip,
                path: "/opt/opslin",
            };
            setSessions([session]);
            setActiveSession(session.id);
        }
    }, [liveServers, selectedServer]);

    const handleNewSession = useCallback(() => {
        if (!selectedServerData) return;
        const session: TerminalSession = {
            id: `session-${Date.now()}`,
            serverId: selectedServer,
            serverName: selectedServerData.name || selectedServerData.hostname || selectedServerData.ip,
            path: "~",
        };
        setSessions(prev => [...prev, session]);
        setActiveSession(session.id);
    }, [selectedServer, selectedServerData]);

    const handleCloseSession = useCallback((sessionId: string) => {
        setSessions(prev => {
            const next = prev.filter(s => s.id !== sessionId);
            if (activeSession === sessionId && next.length > 0) {
                setActiveSession(next[next.length - 1].id);
            }
            return next;
        });
    }, [activeSession]);

    const handleConnect = useCallback(() => {
        setIsConnected(true);
    }, []);

    const handleDisconnect = useCallback(() => {
        setIsConnected(false);
    }, []);

    const handleQuickCommand = useCallback((command: string) => {
        xtermRef.current?.sendCommand(command);
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!terminalContainerRef.current) return;
        if (!document.fullscreenElement) {
            terminalContainerRef.current.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    }, []);

    const handleServerChange = useCallback((serverId: string) => {
        setSelectedServer(serverId);
        const server = servers.find(s => s.id === serverId);
        if (!server) return;
        const session: TerminalSession = {
            id: `session-${Date.now()}`,
            serverId,
            serverName: server.name || server.hostname || server.ip,
            path: "~",
        };
        setSessions([session]);
        setActiveSession(session.id);
        setIsConnected(false);
    }, [servers]);

    // Compute uptime display
    const serverUptime = selectedServerData?.connectedAt
        ? (() => {
            const diff = Date.now() - new Date(selectedServerData.connectedAt).getTime();
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            return days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;
        })()
        : "N/A";

    return (
        <PlanGate
            feature="server.terminal"
            fallback={<div className="p-6"><UpgradePrompt feature="server.terminal" /></div>}
        >
            <div className="dashboard-page">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Terminal size={36} />
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Terminal</h1>
                            <p className="text-sm text-muted-foreground">Access and manage your servers through a secure web terminal</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border/60 bg-card text-xs">
                            <Bookmark className="h-3.5 w-3.5" /> Saved Sessions
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border/60 bg-card text-xs">
                            <Code2 className="h-3.5 w-3.5" /> Snippets
                        </Button>
                        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleNewSession} disabled={!isSelectedServerLive}>
                            <Plus className="h-3.5 w-3.5" /> New Session
                        </Button>
                    </div>
                </div>

                {/* Connected Server Info Bar */}
                {selectedServerData && isSelectedServerLive && (
                    <div className="rounded-xl border border-border/60 bg-card px-5 py-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Connected Server</span>
                                <Select value={selectedServer} onValueChange={handleServerChange}>
                                    <SelectTrigger className="h-7 w-auto gap-2 border-border/60 bg-background px-2.5 text-xs">
                                        <span className="h-2 w-2 rounded-full bg-success" />
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {liveServers.map(s => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name || s.hostname || s.ip} ({s.ip})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-5 text-xs text-muted-foreground sm:ml-auto">
                                <div className="flex items-center gap-1.5">
                                    <Cpu size={16} />
                                    <span>{selectedServerData.os || "OS unknown"}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>{serverUptime}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Bot size={16} />
                                    <span>{selectedServerData.agentVersion ? `v${selectedServerData.agentVersion}` : "not reported"}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-mono">{selectedServerData.ip}</span>
                                </div>
                                <a href={`/servers/${selectedServer}`} className="text-info-text hover:text-info font-medium flex items-center gap-1">
                                    Server Overview →
                                </a>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Terminal Area */}
                <div className="flex gap-4 min-h-[calc(100vh-320px)]">
                    {/* Left Sidebar */}
                    {!isFullscreen && (
                        <div className="hidden lg:flex w-64 flex-col gap-4 shrink-0">
                            {/* Sessions */}
                            <div className="rounded-xl border border-border/60 bg-card p-4 flex-1">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-foreground">Sessions</h3>
                                    <button
                                        onClick={handleNewSession}
                                        disabled={!isSelectedServerLive}
                                        className="h-6 w-6 rounded-md bg-info-muted hover:bg-info-muted flex items-center justify-center text-info-text transition-colors disabled:opacity-40"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="space-y-1">
                                    {sessions.map(session => (
                                        <button
                                            key={session.id}
                                            onClick={() => setActiveSession(session.id)}
                                            className={`w-full text-left rounded-lg px-3 py-2.5 text-xs transition-colors ${
                                                activeSession === session.id
                                                    ? "bg-info-muted border border-info/30 text-info"
                                                    : "hover:bg-muted/50 text-foreground"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Terminal className="h-3.5 w-3.5 text-info-text" />
                                                    <span className="font-medium truncate">{session.serverName}</span>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">SSH</span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-muted-foreground pl-5 truncate">{session.path}</div>
                                        </button>
                                    ))}
                                    {sessions.length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-4">No active sessions</p>
                                    )}
                                </div>
                            </div>

                            {/* Quick Commands */}
                            <div className="rounded-xl border border-border/60 bg-card p-4">
                                <h3 className="text-sm font-semibold text-foreground mb-3">Quick Commands</h3>
                                <div className="space-y-1">
                                    {QUICK_COMMANDS.map(cmd => (
                                        <button
                                            key={cmd.label}
                                            onClick={() => handleQuickCommand(cmd.command)}
                                            disabled={!isConnected}
                                            className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors group disabled:opacity-40 disabled:cursor-not-allowed"
                                            title={cmd.command}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-xs font-medium text-foreground">{cmd.label}</div>
                                                    <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[160px]">{cmd.command}</div>
                                                </div>
                                                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-info-text">
                                                    <Zap className="h-3.5 w-3.5" />
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <a href="#" className="mt-3 block text-xs text-info-text hover:text-info font-medium">
                                    View All Snippets →
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Terminal Panel */}
                    <div ref={terminalContainerRef} className="flex-1 flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden min-w-0">
                        {/* Tab Bar */}
                        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5">
                            <div className="flex items-center gap-1 overflow-x-auto">
                                {sessions.map(session => (
                                    <div
                                        key={session.id}
                                        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                                            activeSession === session.id
                                                ? "bg-card border border-border/60 text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                        }`}
                                        onClick={() => setActiveSession(session.id)}
                                    >
                                        <Terminal className="h-3 w-3 text-info-text" />
                                        <span className="font-medium truncate max-w-[120px]">{session.serverName}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleCloseSession(session.id); }}
                                            className="ml-1 rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={handleNewSession}
                                    disabled={!isSelectedServerLive}
                                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
                                >
                                    <Plus className="h-3 w-3" /> New Tab
                                </button>
                            </div>
                            {/* Toolbar */}
                            <div className="flex items-center gap-1 ml-2">
                                <button className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Copy">
                                    <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Paste">
                                    <ClipboardPaste className="h-3.5 w-3.5" />
                                </button>
                                <button className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Clear">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                <div className="w-px h-4 bg-border/60 mx-1" />
                                <button onClick={toggleFullscreen} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Fullscreen">
                                    {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                        </div>

                        {/* Terminal Content */}
                        <div className="flex-1 min-h-[400px] bg-inverse">
                            {selectedServer && isSelectedServerLive ? (
                                <XTermTerminal
                                    ref={xtermRef}
                                    serverId={selectedServer}
                                    onConnect={handleConnect}
                                    onDisconnect={handleDisconnect}
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center">
                                    <div className="text-center">
                                        {liveServers.length === 0 ? (
                                            <>
                                                <Unplug size={48} className="mx-auto mb-4" />
                                                <h3 className="text-base font-medium text-text-on-inverse-muted">No servers online</h3>
                                                <p className="mt-1 text-sm text-text-on-inverse-muted">Terminal requires an active agent connection</p>
                                            </>
                                        ) : (
                                            <>
                                                <Terminal size={48} className="mx-auto mb-4" />
                                                <h3 className="text-base font-medium text-text-on-inverse-muted">Select a server</h3>
                                                <p className="mt-1 text-sm text-text-on-inverse-muted">Choose a server to open a terminal session</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Status Bar */}
                        <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-1.5 text-[11px]">
                            <div className="flex items-center gap-4">
                                <span className={`flex items-center gap-1.5 font-medium ${isConnected ? "text-success" : "text-muted-foreground"}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-success" : "bg-muted-foreground/40"}`} />
                                    {isConnected ? "Connected" : "Disconnected"}
                                </span>
                                <span className="flex items-center gap-1 text-muted-foreground">
                                    <Shield className="h-3 w-3" /> Secure
                                </span>
                                <span className="flex items-center gap-1 text-muted-foreground">
                                    <Wifi className="h-3 w-3" /> WebSocket
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Auto-reconnect</span>
                                <button
                                    onClick={() => setAutoReconnect(!autoReconnect)}
                                    className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${autoReconnect ? "bg-info" : "bg-muted-foreground/30"}`}
                                >
                                    <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${autoReconnect ? "translate-x-4" : "translate-x-0.5"}`} />
                                </button>
                                <span className={`font-medium ${autoReconnect ? "text-info" : "text-muted-foreground"}`}>
                                    {autoReconnect ? "ON" : "OFF"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </PlanGate>
    );
}
