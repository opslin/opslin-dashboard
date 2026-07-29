"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Server,
    LayoutDashboard,
    Box,
    Database,
    Terminal,
    Activity,
    Bell,
    History,
    Info,
    Settings,
    LogOut,
    Users,
    ServerCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";

const navigation = [
    { name: "Overview", href: "/", icon: LayoutDashboard },
    { name: "Servers", href: "/servers", icon: Server },
    { name: "Agents", href: "/agents", icon: ServerCog },
    { name: "Apps", href: "/apps", icon: Box },
    { name: "Databases", href: "/databases", icon: Database },
    { name: "Monitoring", href: "/monitoring", icon: Activity },
    { name: "Alerts", href: "/alerts", icon: Bell },
    { name: "Activity", href: "/activity", icon: History },
    { name: "Team", href: "/teams", icon: Users },
    { name: "Terminal", href: "/terminal", icon: Terminal },
];

const bottomNav = [
    { name: "About", href: "/about", icon: Info },
    { name: "Settings", href: "/settings", icon: Settings },
];

function withBasePath(basePath: string, href: string) {
    if (!basePath) {
        return href;
    }
    if (href === "/") {
        return basePath;
    }
    return `${basePath}${href}`;
}

export function Sidebar({ basePath = "" }: { basePath?: string }) {
    const pathname = usePathname();
    const { logout } = useAuth();

    return (
        <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
            {/* Logo */}
            <div className="flex h-16 items-center gap-2 px-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
                    <Server className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-semibold text-slate-900">Opslin</span>
            </div>

            <Separator />

            {/* Main Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-4">
                {navigation.map((item) => {
                    const href = withBasePath(basePath, item.href);
                    const isActive = pathname === href ||
                        (href !== basePath && pathname.startsWith(href));

                    return (
                        <Link
                            key={item.name}
                            href={href}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            )}
                        >
                            <item.icon className="h-5 w-5" />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Navigation */}
            <div className="space-y-1 px-3 py-4">
                <Separator className="mb-4" />
                {bottomNav.map((item) => {
                    const href = withBasePath(basePath, item.href);
                    const isActive = pathname === href;

                    return (
                        <Link
                            key={item.name}
                            href={href}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            )}
                        >
                            <item.icon className="h-5 w-5" />
                            {item.name}
                        </Link>
                    );
                })}
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 px-3 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    onClick={logout}
                >
                    <LogOut className="h-5 w-5" />
                    Log out
                </Button>
            </div>
        </aside>
    );
}
