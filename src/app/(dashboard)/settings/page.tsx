"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import {
    BadgeCheck,
    CreditCard,
    KeyRound,
    Monitor,
    Plus,
    Save,
    Server,
    ShieldCheck,
    UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { SessionManager } from "@/components/settings/session-manager";
import { PlanSettings } from "@/components/settings/plan-settings";
import { ApiKeyManager } from "@/components/settings/api-key-manager";
import { EmailVerificationCard } from "@/components/settings/email-verification-card";
import { FleetSharingToggle } from "@/components/settings/fleet-sharing-toggle";
import { removeToken } from "@/lib/auth";
import { api } from "@/lib/api";
import { initialsFor } from "@/lib/utils";

const settingsHighlights = [
    { title: "Identity", description: "Profile and workspace details", icon: UserRound },
    { title: "Security", description: "Password and sessions", icon: ShieldCheck },
    { title: "Billing", description: "Plan and quota usage", icon: CreditCard },
    { title: "Access", description: "API keys and server setup", icon: KeyRound },
];

function displayValue(value?: string | null, fallback = "Not set") {
    return value && value.trim().length > 0 ? value : fallback;
}

export default function SettingsPage() {
    const { user, refetch } = useAuth();
    const router = useRouter();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");

    const newDashboardEnabled = Boolean(user?.preferences?.newDashboard);

    const preferencesMutation = useMutation({
        mutationFn: (newDashboard: boolean) => api.updatePreferences({ newDashboard }),
        onSuccess: async () => {
            await refetch();
        },
    });

    const passwordMutation = useMutation({
        mutationFn: () => api.changePassword({ currentPassword, newPassword }),
        onSuccess: () => {
            removeToken();
            router.push("/login");
        },
    });

    const accountName = displayValue(user?.name, "Operator");
    const accountEmail = displayValue(user?.email);
    const organizationName = displayValue(user?.organizationName, "Personal org");
    const orgRole = displayValue(user?.orgRole, "Unknown role");
    const emailVerified = Boolean(user?.emailVerified);

    return (
        <>
            <Header
                title="Settings"
                description="Manage profile, security, billing, and access controls for your Opslin workspace."
            />

            <div className="dashboard-page max-w-7xl">
                <div className="space-y-6">
                    <Card className="relative overflow-hidden border-border/80 bg-gradient-to-br from-primary/10 via-card to-secondary/60 shadow-sm">
                        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
                        <CardContent className="relative p-5 sm:p-6 lg:p-7">
                            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                                    <Avatar className="size-16 border border-border/80 bg-background shadow-sm">
                                        <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
                                            {initialsFor(user?.name, user?.email)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 space-y-3">
                                        <div className="min-w-0">
                                            <h2 className="truncate text-2xl font-semibold text-foreground">
                                                {accountName}
                                            </h2>
                                            <p className="truncate text-sm text-muted-foreground">{accountEmail}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant={emailVerified ? "default" : "secondary"}>
                                                <BadgeCheck className="size-3" />
                                                {emailVerified ? "Email verified" : "Verify email"}
                                            </Badge>
                                            <Badge variant="outline" className="bg-background/70">
                                                {newDashboardEnabled ? "Dashboard v2" : "Legacy dashboard"}
                                            </Badge>
                                            <Badge variant="outline" className="bg-background/70">
                                                {orgRole}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2 lg:w-[25rem]">
                                    <div className="rounded-xl border border-border/70 bg-background/70 p-4 backdrop-blur">
                                        <p className="text-xs font-medium uppercase text-muted-foreground">Workspace</p>
                                        <p className="mt-1 truncate font-medium text-foreground">{organizationName}</p>
                                    </div>
                                    <div className="rounded-xl border border-border/70 bg-background/70 p-4 backdrop-blur">
                                        <p className="text-xs font-medium uppercase text-muted-foreground">Account mode</p>
                                        <p className="mt-1 truncate font-medium text-foreground">
                                            {newDashboardEnabled ? "Command-first" : "Classic"}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Separator className="my-6 bg-border/70" />

                            <div className="grid gap-3 md:grid-cols-4">
                                {settingsHighlights.map(({ title, description, icon: Icon }) => (
                                    <div key={title} className="rounded-xl border border-border/70 bg-background/60 p-4">
                                        <Icon className="size-4 text-primary" />
                                        <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                <Button asChild className="w-full sm:w-fit">
                                    <Link href="/pricing">
                                        Open pricing
                                        <CreditCard className="size-4" />
                                    </Link>
                                </Button>
                                <Button asChild variant="outline" className="w-full sm:w-fit">
                                    <Link href="/servers">
                                        Add server
                                        <Server className="size-4" />
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                        <div className="space-y-6">
                            <Card className="border-border/80 shadow-sm">
                                <CardHeader>
                                    <div className="flex items-start gap-3">
                                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                            <UserRound className="size-5" />
                                        </div>
                                        <div>
                                            <CardTitle>Profile</CardTitle>
                                            <CardDescription>Your account information and workspace identity.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Name</Label>
                                            <Input
                                                id="name"
                                                defaultValue={user?.name || ""}
                                                placeholder="Your name"
                                                disabled
                                                className="bg-secondary/50 text-muted-foreground"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email</Label>
                                            <Input
                                                id="email"
                                                type="email"
                                                defaultValue={user?.email || ""}
                                                disabled
                                                className="bg-secondary/50 text-muted-foreground"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-sm text-muted-foreground">
                                            Profile editing isn&apos;t available yet — name and email are read-only.
                                        </p>
                                        <Button className="w-full sm:w-fit" disabled>
                                            <Save className="mr-2 h-4 w-4" />
                                            Save Changes (soon)
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-border/80 shadow-sm">
                                <CardHeader>
                                    <div className="flex items-start gap-3">
                                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                            <ShieldCheck className="size-5" />
                                        </div>
                                        <div>
                                            <CardTitle>Password</CardTitle>
                                            <CardDescription>
                                                Changing your password revokes every active session and requires a fresh login.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="currentPassword">Current password</Label>
                                            <Input
                                                id="currentPassword"
                                                type="password"
                                                value={currentPassword}
                                                onChange={(event) => setCurrentPassword(event.target.value)}
                                                autoComplete="current-password"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="newPassword">New password</Label>
                                            <Input
                                                id="newPassword"
                                                type="password"
                                                value={newPassword}
                                                onChange={(event) => setNewPassword(event.target.value)}
                                                autoComplete="new-password"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-foreground">Session reset required</p>
                                            <p className="text-sm text-muted-foreground">
                                                Use at least 8 characters. After success, you will be sent to login.
                                            </p>
                                        </div>
                                        <Button
                                            onClick={() => passwordMutation.mutate()}
                                            disabled={
                                                passwordMutation.isPending ||
                                                currentPassword.trim().length === 0 ||
                                                newPassword.trim().length < 8
                                            }
                                            className="w-full sm:w-fit"
                                            data-testid="change-password-button"
                                        >
                                            <KeyRound className="mr-2 h-4 w-4" />
                                            Change Password
                                        </Button>
                                    </div>
                                    {passwordMutation.isError && (
                                        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                            {passwordMutation.error instanceof Error
                                                ? passwordMutation.error.message
                                                : "Unable to change password."}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>

                            <EmailVerificationCard user={user} onVerified={refetch} />

                            <PlanSettings />
                        </div>

                        <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
                            <Card className="border-border/80" elevation="raised">
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                <Monitor className="size-5" />
                                            </div>
                                            <div>
                                                <CardTitle>Dashboard Experience</CardTitle>
                                                <CardDescription>
                                                    Command palette, keyboard navigation, and the current dashboard shell.
                                                </CardDescription>
                                            </div>
                                        </div>
                                        <Badge variant={newDashboardEnabled ? "default" : "secondary"}>
                                            {newDashboardEnabled ? "Enabled" : "Disabled"}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-secondary/30 p-4">
                                        <div className="min-w-0 space-y-1">
                                            <p className="font-medium text-foreground">Enable Dashboard v2</p>
                                            <p className="text-sm text-muted-foreground">
                                                Legacy routes remain available under <code>/v1</code> during cut-over.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={newDashboardEnabled}
                                            disabled={preferencesMutation.isPending}
                                            onCheckedChange={(checked) => preferencesMutation.mutate(checked)}
                                            aria-label="Toggle Dashboard v2"
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <FleetSharingToggle orgRole={user?.orgRole} />

                            <ApiKeyManager />

                            <SessionManager />

                            <Card className="border-border/80" elevation="raised">
                                <CardHeader>
                                    <div className="flex items-start gap-3">
                                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                            <Plus className="size-5" />
                                        </div>
                                        <div>
                                            <CardTitle>Adding Servers</CardTitle>
                                            <CardDescription>
                                                Connect a VPS to Opslin with a short-lived install command.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <ol className="space-y-3 text-sm">
                                        {[
                                            ["Open Servers", "Go to the Servers page from the dashboard."],
                                            ["Generate command", "Create a one-time install command."],
                                            ["Run over SSH", "Paste it into your VPS terminal."],
                                            ["Wait for claim", "The server appears automatically when the agent connects."],
                                        ].map(([title, description], index) => (
                                            <li key={title} className="flex gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3">
                                                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                                                    {index + 1}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block font-medium text-foreground">{title}</span>
                                                    <span className="block text-muted-foreground">{description}</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                    <div className="rounded-xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">
                                        Install commands are one-time use and expire in 1 hour for security.
                                    </div>
                                    <Button asChild className="w-full">
                                        <Link href="/servers">
                                            Open Servers
                                            <Server className="size-4" />
                                        </Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
