"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyableCode({ code, label }: { code: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    }

    return (
        <div className="overflow-hidden rounded-lg border border-border bg-inverse">
            {label ? (
                <div className="border-b border-border-inverse px-3 py-1.5 text-xs font-medium text-text-on-inverse-muted">
                    {label}
                </div>
            ) : null}
            <div className="flex items-start justify-between gap-3 p-3">
                <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs leading-5 text-text-inverse">
                    {code}
                </code>
                <button
                    type="button"
                    onClick={handleCopy}
                    aria-label={copied ? "Copied" : "Copy to clipboard"}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-border-inverse px-2 py-1 text-xs font-medium text-text-on-inverse-muted transition-colors hover:text-text-inverse"
                >
                    {copied ? <Check className="size-3.5 text-success-text" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
        </div>
    );
}
