"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createTerminalTheme } from "@/lib/design-system";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const WS_URL = API_URL.replace(/^http/, "ws");
const MAX_RECONNECT_ATTEMPTS = 5;

export type TerminalConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export type TerminalStatus = {
    state: TerminalConnectionState;
    /** Seconds until the next automatic retry, while reconnecting. */
    retryIn?: number;
};

type TerminalInstance = {
    cols: number;
    rows: number;
    options: { fontSize?: number };
    dispose: () => void;
    loadAddon: (addon: unknown) => void;
    open: (element: HTMLElement) => void;
    onData: (callback: (data: string) => void) => { dispose: () => void };
    write: (data: string) => void;
    writeln: (data: string) => void;
    clear: () => void;
    focus: () => void;
    getSelection: () => string;
    hasSelection: () => boolean;
};

type FitAddonInstance = { fit: () => void };

type SearchAddonInstance = {
    findNext: (term: string, options?: { incremental?: boolean; decorations?: unknown }) => boolean;
    findPrevious: (term: string, options?: { decorations?: unknown }) => boolean;
    clearDecorations: () => void;
};

interface XTermTerminalProps {
    serverId: string;
    autoReconnect?: boolean;
    fontSize?: number;
    onStatusChange?: (status: TerminalStatus) => void;
    onOutput?: (chunk: string) => void;
    onSelectionChange?: (text: string) => void;
    onError?: (error: string) => void;
}

export interface XTermTerminalHandle {
    /** Injects text into the live session exactly as if it had been typed, then presses Enter. */
    sendCommand: (command: string) => void;
    /** Puts text on the prompt without pressing Enter. */
    insertText: (text: string) => void;
    copySelection: () => Promise<boolean>;
    paste: () => Promise<boolean>;
    clear: () => void;
    focus: () => void;
    fit: () => void;
    find: (term: string, direction?: "next" | "previous") => boolean;
    clearFind: () => void;
    reconnect: () => void;
    getSelection: () => string;
}

export const XTermTerminal = forwardRef<XTermTerminalHandle, XTermTerminalProps>(function XTermTerminal({
    serverId,
    autoReconnect = true,
    fontSize = 14,
    onStatusChange,
    onOutput,
    onSelectionChange,
    onError,
}, ref) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const termInstanceRef = useRef<TerminalInstance | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fitAddonRef = useRef<FitAddonInstance | null>(null);
    const searchAddonRef = useRef<SearchAddonInstance | null>(null);
    const connectRef = useRef<(() => void) | null>(null);

    // Keep the latest props in refs so the terminal and socket are never rebuilt just because a callback changed.
    const callbacks = useRef({ onStatusChange, onOutput, onSelectionChange, onError });
    const autoReconnectRef = useRef(autoReconnect);
    const fontSizeRef = useRef(fontSize);
    useEffect(() => {
        callbacks.current = { onStatusChange, onOutput, onSelectionChange, onError };
        autoReconnectRef.current = autoReconnect;
    });

    useEffect(() => {
        fontSizeRef.current = fontSize;
        const terminal = termInstanceRef.current;
        if (terminal) {
            terminal.options.fontSize = fontSize;
            fitAddonRef.current?.fit();
        }
    }, [fontSize]);

    const sendRaw = (data: string) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "input", data }));
            return true;
        }
        return false;
    };

    useImperativeHandle(ref, () => ({
        sendCommand: (command: string) => {
            sendRaw(`${command}\n`);
            termInstanceRef.current?.focus();
        },
        insertText: (text: string) => {
            sendRaw(text);
            termInstanceRef.current?.focus();
        },
        copySelection: async () => {
            const text = termInstanceRef.current?.getSelection() ?? "";
            if (!text) return false;
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                return false;
            }
        },
        paste: async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (!text) return false;
                const sent = sendRaw(text);
                termInstanceRef.current?.focus();
                return sent;
            } catch {
                return false;
            }
        },
        clear: () => {
            termInstanceRef.current?.clear();
            // Ask the shell to redraw its prompt after the screen is cleared.
            sendRaw("\u000c");
        },
        focus: () => termInstanceRef.current?.focus(),
        fit: () => fitAddonRef.current?.fit(),
        find: (term, direction = "next") => {
            const search = searchAddonRef.current;
            if (!search || !term) return false;
            return direction === "next" ? search.findNext(term) : search.findPrevious(term);
        },
        clearFind: () => searchAddonRef.current?.clearDecorations(),
        reconnect: () => connectRef.current?.(),
        getSelection: () => termInstanceRef.current?.getSelection() ?? "",
    }), []);

    useEffect(() => {
        if (!terminalRef.current) return;

        let terminal: TerminalInstance | null = null;
        let fitAddon: FitAddonInstance | null = null;
        let inputSubscription: { dispose: () => void } | null = null;
        let selectionSubscription: { dispose: () => void } | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let connectTimer: number | undefined;
        let retryTimer: number | undefined;
        let attempts = 0;
        let disposed = false;

        const emit = (status: TerminalStatus) => callbacks.current.onStatusChange?.(status);

        const handleResize = () => {
            try {
                fitAddon?.fit();
            } catch {
                return;
            }
            const ws = wsRef.current;
            if (ws?.readyState === WebSocket.OPEN && terminal) {
                ws.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
            }
        };

        const clearRetry = () => {
            if (retryTimer) {
                window.clearInterval(retryTimer);
                retryTimer = undefined;
            }
        };

        const scheduleReconnect = (reason: string) => {
            if (disposed) return;
            if (!autoReconnectRef.current || attempts >= MAX_RECONNECT_ATTEMPTS) {
                emit({ state: "disconnected" });
                return;
            }
            attempts += 1;
            let remaining = Math.min(2 ** attempts, 15);
            emit({ state: "reconnecting", retryIn: remaining });
            terminal?.writeln(`\r\n\x1b[33m${reason}. Retrying in ${remaining}s...\x1b[0m`);
            clearRetry();
            retryTimer = window.setInterval(() => {
                remaining -= 1;
                if (remaining <= 0) {
                    clearRetry();
                    connect();
                } else {
                    emit({ state: "reconnecting", retryIn: remaining });
                }
            }, 1000);
        };

        const connect = () => {
            if (disposed || !terminal) return;
            clearRetry();
            const previous = wsRef.current;
            if (previous && (previous.readyState === WebSocket.OPEN || previous.readyState === WebSocket.CONNECTING)) {
                previous.onclose = null;
                previous.close();
            }
            emit({ state: "connecting" });

            const ws = new WebSocket(`${WS_URL}/terminal/${serverId}`);
            wsRef.current = ws;

            ws.onopen = () => {
                attempts = 0;
                emit({ state: "connected" });
                handleResize();
            };
            ws.onmessage = (event) => {
                const chunk = typeof event.data === "string" ? event.data : "";
                terminal?.write(event.data);
                if (chunk) callbacks.current.onOutput?.(chunk);
            };
            ws.onerror = () => {
                callbacks.current.onError?.("WebSocket connection failed");
            };
            ws.onclose = (event) => {
                if (disposed || wsRef.current !== ws) return;
                const reason = event.reason ? ` (${event.reason})` : "";
                scheduleReconnect(`Connection dropped${reason}`);
            };
        };
        connectRef.current = () => {
            attempts = 0;
            connect();
        };

        const initTerminal = async () => {
            const { Terminal } = await import("@xterm/xterm");
            const { FitAddon } = await import("@xterm/addon-fit");
            const { SearchAddon } = await import("@xterm/addon-search");
            await import("@xterm/xterm/css/xterm.css");

            if (disposed) return;
            const element = terminalRef.current;
            if (!element) return;

            terminal = new Terminal({
                cursorBlink: true,
                fontSize: fontSizeRef.current,
                lineHeight: 1.35,
                fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
                allowProposedApi: true,
                scrollback: 5000,
                theme: createTerminalTheme(),
            }) as unknown as TerminalInstance;

            fitAddon = new FitAddon() as unknown as FitAddonInstance;
            const searchAddon = new SearchAddon() as unknown as SearchAddonInstance;
            terminal.loadAddon(fitAddon);
            terminal.loadAddon(searchAddon);
            terminal.open(element);
            window.requestAnimationFrame(() => fitAddon?.fit());

            termInstanceRef.current = terminal;
            fitAddonRef.current = fitAddon;
            searchAddonRef.current = searchAddon;

            connectTimer = window.setTimeout(connect, 50);

            inputSubscription = terminal.onData((data) => {
                const ws = wsRef.current;
                if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "input", data }));
                }
            });
            const withSelection = terminal as unknown as { onSelectionChange?: (cb: () => void) => { dispose: () => void } };
            selectionSubscription = withSelection.onSelectionChange?.(() => callbacks.current.onSelectionChange?.(terminal?.getSelection() ?? "")) ?? null;

            window.addEventListener("resize", handleResize);
            if (typeof ResizeObserver !== "undefined") {
                resizeObserver = new ResizeObserver(() => handleResize());
                resizeObserver.observe(element);
            }
        };

        void initTerminal();

        return () => {
            disposed = true;
            if (connectTimer) window.clearTimeout(connectTimer);
            clearRetry();
            window.removeEventListener("resize", handleResize);
            resizeObserver?.disconnect();
            inputSubscription?.dispose();
            selectionSubscription?.dispose();
            const ws = wsRef.current;
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                ws.onclose = null;
                ws.close();
            }
            wsRef.current = null;
            connectRef.current = null;
            termInstanceRef.current = null;
            fitAddonRef.current = null;
            searchAddonRef.current = null;
            terminal?.dispose();
        };
    }, [serverId]);

    return <div ref={terminalRef} className="h-full w-full bg-inverse px-4 py-3" />;
});
