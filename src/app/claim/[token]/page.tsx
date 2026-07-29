"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Server, Check, Loader2, AlertCircle, Clock } from "lucide-react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LivePulse } from "@/components/patterns/live-pulse";
import { useAuth } from "@/hooks/use-auth";

type ClaimStatus = "loading" | "pending" | "claiming" | "success" | "expired" | "error";

export default function ClaimPage() {
    const params = useParams();
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const reduceMotion = useReducedMotion();
    const [status, setStatus] = useState<ClaimStatus>("loading");
    const [serverInfo, setServerInfo] = useState<{ hostname: string; os: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const token = params.token as string;

    useEffect(() => {
        async function checkStatus() {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agent/claim/${token}/status`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === "pending") {
                        setServerInfo({ hostname: data.hostname, os: data.os });
                        setStatus("pending");
                    } else if (data.status === "claimed") {
                        router.push("/servers");
                    } else if (data.status === "expired") {
                        setStatus("expired");
                    }
                } else {
                    setError("This claim link is invalid or has expired.");
                    setStatus("error");
                }
            } catch {
                setError("Failed to check claim status.");
                setStatus("error");
            }
        }

        if (token) {
            checkStatus();
        }
    }, [token, router]);

    const handleClaim = async () => {
        if (!user) {
            router.push(`/login?redirect=/claim/${token}`);
            return;
        }

        setStatus("claiming");

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agent/claim/${token}`, {
                method: "POST",
                credentials: "include",
            });

            const data = await res.json();

            if (res.ok) {
                setStatus("success");
                setTimeout(() => {
                    router.push(`/servers/${data.server.id}`);
                }, 1500);
            } else {
                setError(data.message || "Failed to claim server");
                setStatus("error");
            }
        } catch {
            setError("Failed to claim server");
            setStatus("error");
        }
    };

    if (authLoading || status === "loading") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <AnimatePresence mode="wait">
                <motion.div
                    key={status}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="w-full max-w-md"
                >
                <Card className="w-full">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        {status === "success" ? <Check className="h-8 w-8" /> : <Server className="h-8 w-8" />}
                    </div>
                    <CardTitle>
                        {status === "error" ? "Claim Failed" :
                            status === "expired" ? "Link Expired" :
                                status === "success" ? "Server Claimed!" :
                                    "Claim Your Server"}
                    </CardTitle>
                    <CardDescription>
                        {status === "error" ? error :
                            status === "expired" ? "Please reinstall the agent to get a new link." :
                                status === "success" ? "Redirecting to dashboard..." :
                                    "This server is not linked to any account yet."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {status === "error" && (
                        <div className="flex items-center gap-3 rounded-lg bg-danger-muted p-4 text-danger-text">
                            <AlertCircle className="h-5 w-5 flex-shrink-0" />
                            <p className="text-sm">{error}</p>
                        </div>
                    )}

                    {status === "expired" && (
                        <div className="flex items-center gap-3 rounded-lg bg-warning-muted p-4 text-warning-text">
                            <Clock className="h-5 w-5 flex-shrink-0" />
                            <p className="text-sm">This claim link has expired. Run the install command again on your VPS.</p>
                        </div>
                    )}

                    {status === "success" && (
                        <div className="flex items-center gap-3 rounded-lg bg-success-muted p-4 text-success-text">
                            <Check className="h-5 w-5 flex-shrink-0" />
                            <p className="text-sm">Server claimed successfully!</p>
                        </div>
                    )}

                    {status === "pending" && serverInfo && (
                        <>
                            <div className="rounded-xl border border-success/30 bg-success-muted p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <LivePulse label="Agent connected" />
                                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-success-text">
                                        Agent connected
                                    </span>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Hostname</span>
                                        <span className="font-medium text-foreground">{serverInfo.hostname}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">OS</span>
                                        <span className="font-medium text-foreground">{serverInfo.os}</span>
                                    </div>
                                </div>
                            </div>

                            {!user ? (
                                <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground text-center">
                                        Login or create an account to claim this server.
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Button
                                            variant="outline"
                                            onClick={() => router.push(`/login?redirect=/claim/${token}`)}
                                        >
                                            Login
                                        </Button>
                                        <Button
                                            onClick={() => router.push(`/register?redirect=/claim/${token}`)}
                                        >
                                            Register
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    onClick={handleClaim}
                                    className="w-full transition-transform duration-150 active:scale-[0.98]"
                                    size="lg"
                                >
                                    Claim This Server
                                </Button>
                            )}

                            <p className="text-xs text-muted-foreground text-center">
                                ⏱ Claim link expires in 1 hour
                            </p>
                        </>
                    )}

                    {status === "claiming" && (
                        <div className="flex items-center justify-center gap-3 py-4">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Claiming server...</span>
                        </div>
                    )}
                </CardContent>
                </Card>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
