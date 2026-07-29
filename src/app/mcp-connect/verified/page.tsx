"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

type Status = "checking" | "success" | "denied" | "error";

function McpConnectVerifiedContent() {
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<Status>("checking");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const code = searchParams.get("code");
        const error = searchParams.get("error");
        const state = searchParams.get("state");

        if (error) {
            setStatus(error === "access_denied" ? "denied" : "error");
            return;
        }
        if (!code || !state) {
            setStatus("error");
            setErrorMessage("Missing code or state in the callback.");
            return;
        }

        const stored = sessionStorage.getItem(`mcp_pkce_${state}`);
        sessionStorage.removeItem(`mcp_pkce_${state}`);
        if (!stored) {
            setStatus("error");
            setErrorMessage("This test session expired or was already used — go back and click Connect again.");
            return;
        }

        const { codeVerifier, clientId, redirectUri } = JSON.parse(stored) as {
            codeVerifier: string;
            clientId: string;
            redirectUri: string;
        };

        api.exchangeMcpAuthCode({ grant_type: "authorization_code", code, code_verifier: codeVerifier, client_id: clientId, redirect_uri: redirectUri })
            .then(() => setStatus("success"))
            .catch((err) => {
                setStatus("error");
                setErrorMessage(err instanceof Error ? err.message : "Token exchange failed");
            });
    }, [searchParams]);

    return (
        <AuthCard
            title={
                status === "success" ? "You're connected" :
                status === "denied" ? "Connection declined" :
                status === "error" ? "Connection failed" : "Confirming…"
            }
            icon={status === "success" ? CheckCircle2 : status === "checking" ? undefined : XCircle}
            maxWidthClassName="max-w-xl"
        >
            {status === "checking" && <p className="text-sm text-muted-foreground">Verifying…</p>}

            {status === "success" && (
                <div className="space-y-3">
                    <p className="text-sm text-foreground">
                        The full login → approve → token exchange loop just completed successfully. An AI tool connecting the same way
                        will work exactly like this did.
                    </p>
                    <Button asChild>
                        <Link href="/mcp-connect">Back</Link>
                    </Button>
                </div>
            )}

            {status === "denied" && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">You declined the connection request.</p>
                    <Button asChild variant="outline">
                        <Link href="/mcp-connect">Try again</Link>
                    </Button>
                </div>
            )}

            {status === "error" && (
                <div className="space-y-3">
                    <p className="text-sm text-danger-text">{errorMessage || "Something went wrong completing the connection."}</p>
                    <Button asChild variant="outline">
                        <Link href="/mcp-connect">Try again</Link>
                    </Button>
                </div>
            )}
        </AuthCard>
    );
}

export default function McpConnectVerifiedPage() {
    return (
        <Suspense
            fallback={
                <AuthCard title="Confirming…" maxWidthClassName="max-w-xl">
                    <p className="text-sm text-muted-foreground">Verifying…</p>
                </AuthCard>
            }
        >
            <McpConnectVerifiedContent />
        </Suspense>
    );
}
