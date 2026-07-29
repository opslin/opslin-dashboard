"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function InviteAcceptPage() {
    const params = useParams();
    const router = useRouter();
    const { user, loading } = useAuth();
    const token = params.token as string;

    const { data, isLoading, isError } = useQuery({
        queryKey: ["invite-preview", token],
        queryFn: () => api.getInvitePreview(token),
        enabled: Boolean(token),
        retry: false,
    });

    const acceptMutation = useMutation({
        mutationFn: () => api.acceptInvite(token),
        onSuccess: () => {
            toast.success("Invite accepted");
            router.push("/teams");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to accept invite");
        },
    });

    const emailMismatch = Boolean(data && user && user.email.toLowerCase() !== data.email.toLowerCase());

    return (
        <AuthCard
            title="Organization invite"
            description="Accept your Opslin team invitation"
            icon={ShieldCheck}
            maxWidthClassName="max-w-xl"
        >
            {isLoading && <p className="text-sm text-muted-foreground">Loading invite…</p>}
            {isError && (
                <p className="text-sm text-danger-text">
                    This invite is invalid, expired, revoked, or already accepted.
                </p>
            )}
            {data && (
                <>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <p className="font-medium text-foreground">{data.organization.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            <Mail className="mr-1 inline h-4 w-4" />
                            {data.email}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Role: <strong>{data.role}</strong>
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Expires: {new Date(data.expiresAt).toLocaleString()}
                        </p>
                    </div>

                    {!loading && !user && (
                        <div className="flex flex-wrap gap-3">
                            <Button asChild>
                                <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
                                    Sign in to accept
                                </Link>
                            </Button>
                            <Button variant="outline" asChild>
                                <Link href={`/register?next=${encodeURIComponent(`/invite/${token}`)}`}>
                                    Create account
                                </Link>
                            </Button>
                        </div>
                    )}

                    {!loading && user && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Signed in as <strong>{user.email}</strong>
                            </p>
                            {emailMismatch ? (
                                <p className="rounded-lg bg-warning-muted p-3 text-sm text-warning-text">
                                    This invite was sent to {data.email}, but you&apos;re signed in as {user.email}.
                                    Sign in with the invited email to accept it.
                                </p>
                            ) : (
                                <Button
                                    onClick={() => acceptMutation.mutate()}
                                    disabled={acceptMutation.isPending}
                                    className="transition-transform duration-150 active:scale-[0.98]"
                                >
                                    {acceptMutation.isPending ? "Accepting…" : "Accept invite"}
                                </Button>
                            )}
                        </div>
                    )}
                </>
            )}
        </AuthCard>
    );
}
