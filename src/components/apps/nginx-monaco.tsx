"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

type MonacoModule = typeof import("monaco-editor");

type Props = {
    value: string;
    onChange: (value: string) => void;
};

export function NginxMonaco({ value, onChange }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<MonacoModule | null>(null);
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        let disposed = false;

        async function setup() {
            if (!containerRef.current) {
                return;
            }

            const monaco = await import("monaco-editor");
            if (disposed || !containerRef.current) {
                return;
            }

            monacoRef.current = monaco;
            editorRef.current = monaco.editor.create(containerRef.current, {
                value,
                language: "plaintext",
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 13,
                roundedSelection: true,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                theme: resolvedTheme === "dark" ? "vs-dark" : "vs",
            });

            editorRef.current.onDidChangeModelContent(() => {
                onChange(editorRef.current?.getValue() ?? "");
            });
        }

        void setup();

        return () => {
            disposed = true;
            editorRef.current?.dispose();
            editorRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- theme applied via the dedicated effect below, not re-created on toggle
    }, [onChange]);

    useEffect(() => {
        if (!editorRef.current) {
            return;
        }
        if (editorRef.current.getValue() !== value) {
            editorRef.current.setValue(value);
        }
    }, [value]);

    // Monaco keeps its own theme registry, independent of the app's CSS
    // tokens — it doesn't pick up dark mode automatically, so it has to be
    // told explicitly whenever the user toggles the theme.
    useEffect(() => {
        monacoRef.current?.editor.setTheme(resolvedTheme === "dark" ? "vs-dark" : "vs");
    }, [resolvedTheme]);

    return <div ref={containerRef} className="h-[40vh] min-h-[320px] w-full overflow-hidden rounded-xl border border-border" />;
}
