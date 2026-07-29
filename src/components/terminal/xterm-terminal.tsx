"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createTerminalTheme } from "@/lib/design-system";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const WS_URL = API_URL.replace(/^http/, "ws");

type TerminalInstance = {
    cols: number;
    rows: number;
    dispose: () => void;
    loadAddon: (addon: unknown) => void;
    open: (element: HTMLElement) => void;
    onData: (callback: (data: string) => void) => { dispose: () => void };
    write: (data: string) => void;
    writeln: (data: string) => void;
};

type FitAddonInstance = {
    fit: () => void;
};

interface XTermTerminalProps {
    serverId: string;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: string) => void;
}

export interface XTermTerminalHandle {
    /** Injects text into the live session exactly as if it had been typed — same "input" WS message, same relay path, no extra request/processing. */
    sendCommand: (command: string) => void;
}

export const XTermTerminal = forwardRef<XTermTerminalHandle, XTermTerminalProps>(function XTermTerminal({
    serverId,
    onConnect,
    onDisconnect,
    onError,
}, ref) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const termInstanceRef = useRef<TerminalInstance | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fitAddonRef = useRef<FitAddonInstance | null>(null);

    useImperativeHandle(ref, () => ({
        sendCommand: (command: string) => {
            const ws = wsRef.current;
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "input", data: `${command}\n` }));
            }
        },
    }), []);

    useEffect(() => {
        if (!terminalRef.current) return;

        let terminal: TerminalInstance | null = null;
        let fitAddon: FitAddonInstance | null = null;
        let inputSubscription: { dispose: () => void } | null = null;
        let connectTimer: number | undefined;
        let disposed = false;

        const handleResize = () => {
            fitAddon?.fit();
            const ws = wsRef.current;
            if (ws?.readyState === WebSocket.OPEN && terminal) {
                ws.send(
                    JSON.stringify({
                        type: "resize",
                        cols: terminal.cols,
                        rows: terminal.rows,
                    })
                );
            }
        };

        const initTerminal = async () => {
            const { Terminal } = await import("@xterm/xterm");
            const { FitAddon } = await import("@xterm/addon-fit");
            await import("@xterm/xterm/css/xterm.css");

            if (disposed) {
                return;
            }

            const element = terminalRef.current;
            if (!element) {
                return;
            }

            terminal = new Terminal({
                cursorBlink: true,
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                theme: createTerminalTheme(),
            }) as unknown as TerminalInstance;

            fitAddon = new FitAddon() as unknown as FitAddonInstance;
            terminal.loadAddon(fitAddon);
            terminal.open(element);
            window.requestAnimationFrame(() => fitAddon?.fit());

            termInstanceRef.current = terminal;
            fitAddonRef.current = fitAddon;

            connectTimer = window.setTimeout(() => {
                if (disposed || !terminal) {
                    return;
                }

                const ws = new WebSocket(`${WS_URL}/terminal/${serverId}`);
                wsRef.current = ws;

                ws.onopen = () => {
                    terminal?.writeln("\x1b[32mConnected. Starting shell on the selected server...\x1b[0m\r\n");
                    onConnect?.();
                };

                ws.onmessage = (event) => {
                    terminal?.write(event.data);
                };

                ws.onerror = () => {
                    terminal?.writeln("\r\n\x1b[31mConnection error. Check that the agent is still connected.\x1b[0m");
                    onError?.("WebSocket connection failed");
                };

                ws.onclose = (event) => {
                    const reason = event.reason ? ` (${event.reason})` : "";
                    terminal?.writeln(`\r\n\x1b[33mDisconnected${reason}\x1b[0m`);
                    onDisconnect?.();
                };
            }, 50);

            // Send terminal input to server
            inputSubscription = terminal.onData((data) => {
                const ws = wsRef.current;
                if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "input", data }));
                }
            });

            window.addEventListener("resize", handleResize);
        };

        void initTerminal();

        return () => {
            disposed = true;
            if (connectTimer) {
                window.clearTimeout(connectTimer);
            }
            window.removeEventListener("resize", handleResize);
            inputSubscription?.dispose();
            const ws = wsRef.current;
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                ws.close();
            }
            wsRef.current = null;
            termInstanceRef.current = null;
            fitAddonRef.current = null;
            terminal?.dispose();
        };
    }, [serverId, onConnect, onDisconnect, onError]);

    return (
        <div
            ref={terminalRef}
            className="h-full min-h-[520px] w-full bg-inverse p-2"
        />
    );
});
