import type { ComponentType, ReactNode } from "react";
import { Server } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ShowcaseShell } from "@/components/ui/showcase-shell";
import { cn } from "@/lib/utils";

// Shared "single card" auth grammar for forgot-password, reset-password,
// verify-email, and invite/accept — same brand mark + token vocabulary as
// AuthSplitShell (login/register), without the right-side rotating panel.
export function AuthCard({
    title,
    description,
    eyebrow,
    icon: Icon = Server,
    maxWidthClassName = "max-w-md",
    variant = "default",
    children,
}: {
    title: string;
    description?: ReactNode;
    eyebrow?: ReactNode;
    icon?: ComponentType<{ className?: string }>;
    maxWidthClassName?: string;
    variant?: "default" | "showcase";
    children: ReactNode;
}) {
    if (variant === "showcase") {
        return (
            <ShowcaseShell>
                <div className="mb-8 space-y-3 text-center">
                    {eyebrow}
                    <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
                    {description ? <p className="text-sm leading-relaxed text-slate-600">{description}</p> : null}
                </div>
                <div className="space-y-5">{children}</div>
            </ShowcaseShell>
        );
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
            <Card className={cn("w-full border-border shadow-sm", maxWidthClassName)}>
                <CardHeader className="space-y-4 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <Icon className="h-6 w-6" />
                    </div>
                    <div className="space-y-2">
                        {eyebrow}
                        <h1 className="text-2xl font-semibold leading-none text-foreground">{title}</h1>
                        {description ? <CardDescription>{description}</CardDescription> : null}
                    </div>
                </CardHeader>
                <CardContent className="space-y-5">{children}</CardContent>
            </Card>
        </main>
    );
}
