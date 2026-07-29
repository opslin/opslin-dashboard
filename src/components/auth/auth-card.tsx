import type { ComponentType, ReactNode } from "react";
import { Server } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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
    children,
}: {
    title: string;
    description?: ReactNode;
    eyebrow?: ReactNode;
    icon?: ComponentType<{ className?: string }>;
    maxWidthClassName?: string;
    children: ReactNode;
}) {
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
