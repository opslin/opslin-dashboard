"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Bot, Check, Copy, Plug } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/usePlan";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const DEMO_CLIENT_NAME = "Opslin — Test Connection";

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = "";
    for (const byte of arr) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(length = 64) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
}

async function pkceChallenge(verifier: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return base64UrlEncode(digest);
}

function CopyField({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="text-[11px] font-medium text-muted-foreground mb-1">{label}</div>
            <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-foreground truncate">{value}</code>
                <button
                    type="button"
                    onClick={async () => {
                        await navigator.clipboard.writeText(value);
                        setCopied(true);
                        toast.success(`${label} copied`);
                        setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                >
                    {copied ? <Check className="h-3.5 w-3.5 text-success-text" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            </div>
        </div>
    );
}

export default function McpLandingPage() {
    const { user, loading } = useAuth();

    return (
        <AuthCard
            title="Connect an AI tool to Opslin"
            description="This is the endpoint AI coding tools (Claude Code, Codex, Kiro, Antigravity...) use to deploy apps, manage databases, and more — on your behalf, through your account."
            icon={Bot}
            maxWidthClassName="max-w-xl"
        >
            {!loading && !user && (
                <div className="flex flex-wrap gap-3">
                    <Button asChild>
                        <Link href={`/login?next=${encodeURIComponent("/mcp-connect")}`}>Sign in</Link>
                    </Button>
                </div>
            )}
            {/* usePlan() below fetches an authenticated-only endpoint — only mounted once a
                user is confirmed present, so a logged-out visitor never triggers its 401
                (any 401 outside /auth/me hard-redirects to bare /login, no next= preserved). */}
            {!loading && user && <SignedInContent email={user.email} />}
        </AuthCard>
    );
}

function SignedInContent({ email }: { email: string }) {
    const { can, loading: planLoading } = usePlan();
    const planBlocked = !planLoading && !can("mcp.access");

    const connectMutation = useMutation({
        mutationFn: async () => {
            const redirectUri = `${window.location.origin}/mcp-connect/verified`;
            const client = await api.registerMcpClient({ client_name: DEMO_CLIENT_NAME, redirect_uris: [redirectUri] });

            const codeVerifier = randomToken(64);
            const codeChallenge = await pkceChallenge(codeVerifier);
            const state = randomToken(16);
            sessionStorage.setItem(`mcp_pkce_${state}`, JSON.stringify({ codeVerifier, clientId: client.client_id, redirectUri }));

            const params = new URLSearchParams({
                client_id: client.client_id,
                redirect_uri: redirectUri,
                response_type: "code",
                code_challenge: codeChallenge,
                code_challenge_method: "S256",
                state,
                scope: "apps:read databases:read",
            });
            window.location.href = `${API_URL}/mcp/oauth/authorize?${params.toString()}`;
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to start connection test");
        },
    });

    if (planBlocked) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Connecting AI tools requires a Starter plan or above.</p>
                <UpgradePrompt feature="mcp.access" />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
                Signed in as <strong>{email}</strong>
            </p>

            <div className="space-y-2">
                <CopyField label="MCP Server URL" value={`${API_URL}/mcp`} />
                <CopyField label="Claude Code setup command" value={`claude mcp add opslin -t http ${API_URL}/mcp`} />
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-sm text-foreground font-medium">Test the connection</p>
                <p className="text-xs text-muted-foreground">
                    Click Connect to run through the real login + approval flow right now and confirm everything works — the same
                    steps an AI tool goes through automatically.
                </p>
                <Button
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    className="gap-2"
                >
                    <Plug className="h-4 w-4" />
                    {connectMutation.isPending ? "Starting…" : "Connect"}
                </Button>
            </div>
        </div>
    );
}
