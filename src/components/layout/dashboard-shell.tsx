"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AppWindow,
  Archive,
  ArrowLeftToLine,
  ArrowRightToLine,
  Bell,
  ChevronDown,
  ChevronRight,
  Command,
  Cpu,
  Crown,
  Database,
  History,
  Home,
  LayoutPanelLeft,
  LogOut,
  Menu,
  MonitorDot,
  Play,
  Plus,
  Rocket,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Users,
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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CommandPalette } from "@/components/layout/command-palette";
import { cn, initialsFor } from "@/lib/utils";
import { useMediaEnabled } from "@/hooks/use-media";
import { siteLinks } from "@/lib/site-links";
import type { User } from "@/lib/api";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const primaryNavigation: NavItem[] = [
  { label: "Overview", href: "/overview", icon: Home },
  { label: "Servers", href: "/servers", icon: Server },
  { label: "Agents", href: "/agents", icon: Cpu },
  { label: "Apps", href: "/apps", icon: AppWindow },
  { label: "Deployments", href: "/deployments", icon: Rocket },
  { label: "Monitoring", href: "/monitoring", icon: MonitorDot },
  { label: "Alerts", href: "/alerts", icon: Bell },
];

const secondaryNavigation: NavItem[] = [
  { label: "Databases", href: "/databases", icon: Database },
  { label: "Backups", href: "/backups", icon: History },
  { label: "Storage", href: "/storage", icon: Archive },
  { label: "Teams", href: "/teams", icon: Users },
  { label: "Transparency", href: "/transparency", icon: ShieldCheck },
  { label: "Terminal", href: "/terminal", icon: SquareTerminal },
  { label: "Settings", href: "/settings", icon: Settings },
];

// Opslin Media is feature-gated (media.enabled). The entry is only added once the API has
// confirmed it for this organization, so organizations without access never see it.
const mediaNavigationItem: NavItem = { label: "Media", href: "/media", icon: Play };

const adminNavigation: NavItem[] = [
  { label: "Super Admin", href: siteLinks.admin, icon: Crown },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function roleLabel(role: string | undefined | null) {
  const value = (role || "OWNER").toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function NavLink({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-3 text-[13px] transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-foreground/80 hover:bg-sidebar-hover hover:text-foreground"
      )}
    >
      {active ? <span aria-hidden="true" className="absolute -left-3 top-0 h-full w-[3px] rounded-r-full bg-sidebar-primary" /> : null}
      <item.icon className={cn("size-[18px] shrink-0", active ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />
      {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
    </Link>
  );
}

/** Everything inside the sidebar, shared by the desktop rail and the mobile sheet. */
function SidebarBody({
  user,
  pathname,
  platformNavigation,
  showAdminNavigation,
  collapsed,
  onNavigate,
  onLogout,
  onToggleCollapsed,
}: {
  user: User | null;
  pathname: string;
  platformNavigation: NavItem[];
  showAdminNavigation: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  onLogout: () => void | Promise<void>;
  onToggleCollapsed?: () => void;
}) {
  const router = useRouter();
  const orgName = user?.organizationName || "Personal org";

  return (
    <>
      {/* Workspace switcher */}
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          router.push("/teams");
        }}
        title={collapsed ? orgName : undefined}
        className={cn("flex h-[68px] w-full shrink-0 items-center gap-3 px-4 text-left", collapsed && "justify-center px-0")}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">
          {orgName.slice(0, 1).toUpperCase()}
        </span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold leading-tight text-foreground">{orgName}</span>
              <span className="block truncate text-xs text-muted-foreground">{roleLabel(user?.orgRole)}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </>
        ) : null}
      </button>

      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <nav aria-label="Primary navigation" className="space-y-0.5">
          {primaryNavigation.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </nav>

        {!collapsed ? <p className="px-3 pb-2 pt-6 text-sm text-muted-foreground">Platform</p> : <div className="pt-4" />}
        <nav aria-label="Platform navigation" className="space-y-0.5">
          {platformNavigation.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </nav>

        {showAdminNavigation ? (
          <nav aria-label="Admin navigation" className="mt-4 space-y-0.5 border-t pt-4">
            {adminNavigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-md px-3 text-sm text-foreground/80 transition-colors hover:bg-sidebar-hover hover:text-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                <item.icon className="size-[18px] shrink-0 text-muted-foreground" />
                {!collapsed ? (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </>
                ) : null}
              </a>
            ))}
          </nav>
        ) : null}
      </div>

      {/* Signed-in user */}
      <div className={cn("px-3 pb-2", collapsed && "px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={collapsed ? user?.name || "Operator" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors hover:bg-sidebar-hover",
                collapsed && "justify-center border-transparent bg-transparent p-1 shadow-none"
              )}
            >
              <Avatar className="size-9 shrink-0">
                <AvatarFallback className="bg-foreground text-sm font-medium text-background">
                  {initialsFor(user?.name, user?.email).slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              {!collapsed ? (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold leading-tight text-foreground">{user?.name || "Operator"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </>
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

      {onToggleCollapsed ? (
        <div className={cn("px-3 pb-3", collapsed && "px-2")}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-foreground/80 transition-colors hover:bg-sidebar-hover hover:text-foreground",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? <ArrowRightToLine className="size-[18px] text-muted-foreground" /> : <ArrowLeftToLine className="size-[18px] text-muted-foreground" />}
            {!collapsed ? "Collapse sidebar" : null}
          </button>
        </div>
      ) : null}
    </>
  );
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const showAdminNavigation = user?.isPlatformAdmin === true;
  const mediaEnabled = useMediaEnabled();
  const platformNavigation = useMemo(() => {
    if (!mediaEnabled) {
      return secondaryNavigation;
    }
    const storageIndex = secondaryNavigation.findIndex((item) => item.href === "/storage");
    const insertAt = storageIndex === -1 ? secondaryNavigation.length : storageIndex + 1;
    return [...secondaryNavigation.slice(0, insertAt), mediaNavigationItem, ...secondaryNavigation.slice(insertAt)];
  }, [mediaEnabled]);

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
    setMobileMenuOpen(false);
  }, [pathname]);

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
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar lg:flex",
          reduceMotion ? "" : "transition-[width] duration-200 ease-out",
          collapsed ? "w-[76px]" : "w-[237px]"
        )}
      >
        <SidebarBody
          user={user}
          pathname={pathname}
          platformNavigation={platformNavigation}
          showAdminNavigation={showAdminNavigation}
          collapsed={collapsed}
          onLogout={onLogout}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-[61px] items-center gap-3 px-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-ml-1 lg:hidden"
              aria-label="Open menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <Link href="/overview" className="flex shrink-0 items-center lg:hidden">
              <Image src="/logo/opslin-logo-black.png" alt="Opslin" width={161} height={50} className="h-7 w-auto max-w-none dark:hidden" />
              <Image src="/logo/opslin-logo-white.png" alt="Opslin" width={161} height={50} className="hidden h-7 w-auto max-w-none dark:block" />
            </Link>

            <button
              type="button"
              className="hidden h-10 w-full max-w-[545px] min-w-0 items-center gap-3 rounded-lg border bg-background px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 sm:flex"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate">Search or run a command…</span>
              <span className="flex items-center gap-1" aria-hidden="true">
                <kbd className="inline-flex size-5 items-center justify-center rounded border bg-muted text-[11px] font-medium text-muted-foreground">
                  <Command className="size-3" />
                </kbd>
                <kbd className="inline-flex size-5 items-center justify-center rounded border bg-muted text-[11px] font-medium text-muted-foreground">K</kbd>
              </span>
              <span className="sr-only">Open command palette</span>
            </button>

            <div className="ml-auto flex items-center gap-2">
              {trialBadge}
              <Button type="button" variant="ghost" size="icon" className="sm:hidden" onClick={() => setCommandOpen(true)} aria-label="Open command palette">
                <Search className="size-4" />
              </Button>
              <Button type="button" variant="outline" className="hidden h-10 sm:inline-flex" onClick={() => router.push("/servers/connect")}>
                <Plus aria-hidden="true" />
                Add server
              </Button>
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              <Button type="button" variant="outline" size="icon" className="hidden size-10 sm:inline-flex" aria-label="Open keyboard shortcuts" onClick={() => setShortcutsOpen(true)}>
                <LayoutPanelLeft className="size-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Account menu" className="rounded-full focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-foreground text-sm font-medium text-background">{initialsFor(user?.name, user?.email).slice(0, 1)}</AvatarFallback>
                    </Avatar>
                  </button>
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
            className="flex-1"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[85%] max-w-xs gap-0 border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigate between Opslin sections</SheetDescription>
          <SidebarBody
            user={user}
            pathname={pathname}
            platformNavigation={platformNavigation}
            showAdminNavigation={showAdminNavigation}
            collapsed={false}
            onNavigate={() => setMobileMenuOpen(false)}
            onLogout={onLogout}
          />
        </SheetContent>
      </Sheet>

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
