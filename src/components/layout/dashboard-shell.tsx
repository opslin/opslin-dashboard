"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  Box,
  ChevronRight,
  ChevronsUpDown,
  Command,
  Database,
  HardDrive,
  LayoutDashboard,
  LogOut,
  MonitorDot,
  PanelLeft,
  Search,
  Server,
  ServerCog,
  Settings,
  Shield,
  Terminal,
  Users,
  Workflow,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CommandPalette } from "@/components/layout/command-palette";
import { cn, initialsFor } from "@/lib/utils";
import { siteLinks } from "@/lib/site-links";
import type { User } from "@/lib/api";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
};

const primaryNavigation: NavItem[] = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard, shortcut: "g o" },
  { label: "Servers", href: "/servers", icon: Server, shortcut: "g s" },
  { label: "Agents", href: "/agents", icon: ServerCog },
  { label: "Apps", href: "/apps", icon: Box, shortcut: "g a" },
  { label: "Deployments", href: "/deployments", icon: Workflow, shortcut: "g d" },
  { label: "Monitoring", href: "/monitoring", icon: MonitorDot, shortcut: "g m" },
  { label: "Alerts", href: "/alerts", icon: Bell, shortcut: "?" },
];

const secondaryNavigation: NavItem[] = [
  { label: "Databases", href: "/databases", icon: Database },
  { label: "Backups", href: "/backups", icon: HardDrive },
  { label: "Teams", href: "/teams", icon: Users },
  { label: "Transparency", href: "/transparency", icon: Activity },
  { label: "Terminal", href: "/terminal", icon: Terminal },
  { label: "Settings", href: "/settings", icon: Settings },
];

const adminNavigation: NavItem[] = [
  { label: "Super Admin", href: siteLinks.admin, icon: Shield },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardShell({
  children,
  user,
  onLogout,
  trialBadge,
}: {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void | Promise<void>;
  trialBadge?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sequence, setSequence] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const showAdminNavigation = user?.isPlatformAdmin === true;

  const routeMap = useMemo(
    () =>
      new Map([
        ["o", "/overview"],
        ["s", "/servers"],
        ["a", "/apps"],
        ["d", "/deployments"],
        ["m", "/monitoring"],
      ]),
    []
  );

  useEffect(() => {
    let sequenceTimeout: number | undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      // A non-Radix modal (currently only the deploy overlay) already owns
      // the keyboard while open — its own Escape/focus-trap handles that.
      // Global shortcuts firing on top of it (R6 a11y pass: found via a real
      // Cmd+K test) stacked the command palette over it, 3+ simultaneous
      // blurred layers over doc 02 §3.3's <=2 budget, and let a global nav
      // shortcut abandon an in-progress deploy. Radix dialogs (command
      // palette itself, alert-dialogs) share this same role/aria-modal
      // contract, so re-pressing a shortcut while one of those is already
      // open is also correctly a no-op here — Escape still closes them.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key?.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }

      const key = event.key?.toLowerCase() || "";
      if (!isTyping && pathname.startsWith("/apps/") && (event.metaKey || event.ctrlKey) && key === "d") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("opslin:command-action", { detail: { action: "deploy" } }));
        return;
      }

      if (!isTyping && pathname.startsWith("/apps/") && (event.metaKey || event.ctrlKey) && key === "l") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("opslin:command-action", { detail: { action: "open-logs" } }));
        return;
      }

      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (key === "?" || (event.shiftKey && key === "/")) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (sequence === "g" && routeMap.has(key)) {
        event.preventDefault();
        router.push(routeMap.get(key)!);
        setSequence("");
        return;
      }

      if (key === "g") {
        setSequence("g");
        window.clearTimeout(sequenceTimeout);
        sequenceTimeout = window.setTimeout(() => setSequence(""), 800);
        return;
      }

      if (key === "c") {
        event.preventDefault();
        router.push("/apps/new");
        return;
      }

      if (key === "r") {
        event.preventDefault();
        if (pathname.startsWith("/apps/")) {
          window.dispatchEvent(new CustomEvent("opslin:command-action", { detail: { action: "rollback" } }));
        } else {
          router.refresh();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (sequenceTimeout) {
        window.clearTimeout(sequenceTimeout);
      }
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pathname, routeMap, router, sequence]);

  return (
    <div className="dashboard-shell flex min-h-screen bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar lg:flex",
          reduceMotion ? "" : "transition-[width] duration-200 ease-out",
          collapsed ? "w-[76px]" : "w-64"
        )}
      >
        {/* Wordmark */}
        <div className={cn("flex h-14 shrink-0 items-center gap-3 px-4", collapsed && "justify-center px-0")}>
          {collapsed ? (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Server className="size-4" />
            </div>
          ) : (
            <Image src="/logo/opslin-logo-white.png" alt="Opslin" width={161} height={50} className="h-8 w-auto" priority />
          )}
        </div>

        {/* Workspace / org card */}
        <div className={cn("px-3 pb-2", collapsed && "px-2")}>
          <button
            type="button"
            onClick={() => router.push("/teams")}
            title={collapsed ? user?.organizationName || "Personal org" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-hover/70 px-3 py-2.5 text-left transition-colors hover:bg-sidebar-hover",
              collapsed && "justify-center px-0 py-2"
            )}
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-hover text-[11px] font-semibold text-sidebar-accent-foreground">
              {(user?.organizationName || "P").slice(0, 1).toUpperCase()}
            </div>
            {!collapsed ? (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-sidebar-accent-foreground">
                    {user?.organizationName || "Personal org"}
                  </p>
                  <p className="truncate text-[11px] uppercase tracking-[0.08em] text-sidebar-foreground">
                    {user?.orgRole || "OWNER"}
                  </p>
                </div>
                <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground" />
              </>
            ) : null}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {!collapsed ? <p className="dashboard-section-label px-3 text-sidebar-foreground">Primary</p> : null}
          <nav aria-label="Primary navigation" className="mt-2 space-y-0.5">
            {primaryNavigation.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-accent-foreground"
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-sidebar-primary" />
                  ) : null}
                  <item.icon className="size-4 shrink-0" />
                  {!collapsed ? (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.shortcut ? (
                        <span className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground">{item.shortcut}</span>
                      ) : null}
                    </>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {!collapsed ? <p className="dashboard-section-label mt-6 px-3 text-sidebar-foreground">Platform</p> : <div className="mt-4" />}
          <nav aria-label="Platform navigation" className="mt-2 space-y-0.5">
            {secondaryNavigation.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-accent-foreground"
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-sidebar-primary" />
                  ) : null}
                  <item.icon className="size-4 shrink-0" />
                  {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>

          {showAdminNavigation ? (
            <>
              {!collapsed ? <p className="dashboard-section-label mt-6 px-3 text-sidebar-foreground">Admin</p> : <div className="mt-4" />}
              <nav aria-label="Admin navigation" className="mt-2 space-y-0.5">
                {adminNavigation.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-accent-foreground",
                      collapsed && "justify-center px-0"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
                  </a>
                ))}
              </nav>
            </>
          ) : null}
        </div>

        {/* Collapse toggle */}
        <div className={cn("px-3", collapsed && "px-2")}>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-lg text-xs text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-accent-foreground",
              collapsed ? "justify-center" : "justify-start px-3"
            )}
          >
            <ChevronRight className={cn("size-3.5 transition-transform", reduceMotion ? "" : "duration-200", !collapsed && "rotate-180")} />
            {!collapsed ? "Collapse" : null}
          </button>
        </div>

        {/* User card */}
        <div className={cn("border-t border-sidebar-border p-3", collapsed && "px-2")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={collapsed ? user?.name || "Operator" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-hover",
                  collapsed && "justify-center px-0"
                )}
              >
                <Avatar className="size-8 shrink-0 border border-sidebar-border">
                  <AvatarFallback className="bg-sidebar-hover text-[11px] text-sidebar-accent-foreground">
                    {initialsFor(user?.name, user?.email)}
                  </AvatarFallback>
                </Avatar>
                {!collapsed ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-sidebar-accent-foreground">{user?.name || "Operator"}</p>
                    <p className="truncate text-xs text-sidebar-foreground">{user?.email}</p>
                  </div>
                ) : null}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuLabel className="space-y-1">
                <p className="truncate text-sm font-medium">{user?.name || "Operator"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings className="mr-2 size-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void onLogout()} className="text-destructive">
                <LogOut className="mr-2 size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-panel backdrop-blur-md sticky top-0 z-40 rounded-none border-x-0 border-t-0">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Link href="/overview" className="flex items-center lg:hidden">
              <Image src="/logo/opslin-logo-black.png" alt="Opslin" width={161} height={50} className="h-7 w-auto" />
            </Link>

            <Button
              type="button"
              variant="outline"
              className="hidden min-w-[16rem] justify-start gap-3 text-muted-foreground sm:flex"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="size-4" />
              <span className="flex-1 text-left">Search, navigate, or run a command…</span>
              <span className="dashboard-kbd">
                <Command className="mr-1 size-3" />K
              </span>
            </Button>

            <div className="ml-auto flex items-center gap-2">
              {trialBadge}
              <Button type="button" variant="ghost" size="icon-sm" className="sm:hidden" onClick={() => setCommandOpen(true)} aria-label="Open command palette">
                <Search className="size-4" />
              </Button>
              <Button type="button" size="sm" className="hidden sm:inline-flex" onClick={() => router.push("/servers")}>
                Add server
              </Button>
              <ThemeToggle />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Open keyboard shortcuts" onClick={() => setShortcutsOpen(true)}>
                <PanelLeft className="size-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 rounded-full px-2">
                    <Avatar className="size-8 border border-border/80">
                      <AvatarFallback>{initialsFor(user?.name, user?.email)}</AvatarFallback>
                    </Avatar>
                    <div className="hidden min-w-0 text-left lg:block">
                      <p className="truncate text-sm font-medium">{user?.name || "Operator"}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.organizationName || "Personal org"}</p>
                    </div>
                    <ChevronsUpDown className="hidden size-4 text-muted-foreground lg:block" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="space-y-1">
                    <p className="truncate text-sm font-medium">{user?.name || "Operator"}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/teams")}>Change organization</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/settings")}>Settings</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void onLogout()} className="text-destructive">
                    <LogOut className="mr-2 size-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            role="main"
            key={pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            className="flex-1 pb-20 lg:pb-0"
          >
            {children}
          </motion.main>
        </AnimatePresence>

        <nav aria-label="Mobile navigation" className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 gap-2 rounded-2xl border border-border/80 bg-card/95 p-2 shadow-lg backdrop-blur lg:hidden">
          {primaryNavigation.slice(0, 5).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium",
                isActive(pathname, item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="size-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} user={user} onLogout={onLogout} />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 text-sm text-muted-foreground">
            {[
              ["Command palette", "⌘K / Ctrl+K"],
              ["Go to overview", "g o"],
              ["Go to servers", "g s"],
              ["Go to apps", "g a"],
              ["Go to deployments", "g d"],
              ["Go to monitoring", "g m"],
              ["Create new resource", "c"],
              ["Deploy current app", "⌘D / Ctrl+D"],
              ["Open current app logs", "⌘L / Ctrl+L"],
              ["Rollback current app / refresh", "r"],
              ["Open shortcuts", "?"],
            ].map(([label, shortcut]) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-3">
                <span>{label}</span>
                <span className="dashboard-kbd">{shortcut}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
