"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Box,
  Database,
  LayoutDashboard,
  LogOut,
  MonitorDot,
  MoonStar,
  RotateCcw,
  Search,
  Server,
  Shield,
  Terminal,
  Workflow,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { api, type Database as DatabaseRecord, type Server as ServerRecord, type User } from "@/lib/api";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { siteLinks } from "@/lib/site-links";

type ActionEntry = {
  id: string;
  label: string;
  section: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  onSelect: () => void;
};

const RECENT_ACTIONS_KEY = "opslin.recent-actions.v1";

function persistRecentAction(id: string) {
  if (typeof window === "undefined") {
    return;
  }
  const current = JSON.parse(window.localStorage.getItem(RECENT_ACTIONS_KEY) || "[]") as string[];
  const next = [id, ...current.filter((entry) => entry !== id)].slice(0, 10);
  window.localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(next));
}

function readRecentActionIds() {
  if (typeof window === "undefined") {
    return [] as string[];
  }
  return JSON.parse(window.localStorage.getItem(RECENT_ACTIONS_KEY) || "[]") as string[];
}

export function CommandPalette({
  open,
  onOpenChange,
  user,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onLogout: () => void | Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [recentActionIds, setRecentActionIds] = useState<string[]>(() => readRecentActionIds());

  const { data: servers = [] } = useQuery({
    queryKey: ["palette", "servers"],
    queryFn: () => api.getServers(),
    enabled: open,
  });

  const { data: apps = [] } = useQuery({
    queryKey: ["palette", "apps"],
    queryFn: () => api.getAllApps(),
    enabled: open,
  });

  const { data: databases = [] } = useQuery({
    queryKey: ["palette", "databases", servers.map((server) => server.id)],
    enabled: open && servers.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        servers.map(async (server) => {
          try {
            const dbs = await api.getDatabases(server.id);
            return dbs.map((db) => ({ ...db, serverName: server.name, serverId: server.id }));
          } catch {
            return [] as Array<DatabaseRecord & { serverName: string; serverId: string }>;
          }
        })
      );
      return results.flat();
    },
  });

  const contextAction = (action: string) => {
    window.dispatchEvent(new CustomEvent("opslin:command-action", { detail: { action } }));
  };

  const actions = useMemo<ActionEntry[]>(() => {
    const toggleThemeLabel = resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";

    return [
      {
        id: "nav-overview",
        label: "Go to Overview",
        section: "Navigate",
        hint: "Infrastructure overview",
        icon: LayoutDashboard,
        shortcut: "g o",
        onSelect: () => router.push("/overview"),
      },
      {
        id: "nav-servers",
        label: "Go to Servers",
        section: "Navigate",
        hint: "Manage connected VPS hosts",
        icon: Server,
        shortcut: "g s",
        onSelect: () => router.push("/servers"),
      },
      {
        id: "nav-apps",
        label: "Go to Apps",
        section: "Navigate",
        hint: "Deployments and application state",
        icon: Box,
        shortcut: "g a",
        onSelect: () => router.push("/apps"),
      },
      {
        id: "nav-deployments",
        label: "Go to Deployments",
        section: "Navigate",
        hint: "Recent releases and rollbacks",
        icon: Workflow,
        shortcut: "g d",
        onSelect: () => router.push("/deployments"),
      },
      {
        id: "nav-monitoring",
        label: "Go to Monitoring",
        section: "Navigate",
        hint: "System and runtime observability",
        icon: MonitorDot,
        shortcut: "g m",
        onSelect: () => router.push("/monitoring"),
      },
      {
        id: "nav-alerts",
        label: "Go to Alerts",
        section: "Navigate",
        hint: "Incidents, silences, and alert history",
        icon: Bell,
        shortcut: "?",
        onSelect: () => router.push("/alerts"),
      },
      ...(user?.isPlatformAdmin === true
        ? [{
            id: "nav-super-admin",
            label: "Go to Super Admin",
            section: "Admin",
            hint: "Opens the admin panel in a new tab",
            icon: Shield,
            onSelect: () => window.open(siteLinks.admin, "_blank", "noopener,noreferrer"),
          }]
        : []),
      {
        id: "action-create-db",
        label: "Create Database",
        section: "Actions",
        hint: "Provision a new database instance",
        icon: Database,
        shortcut: "c",
        onSelect: () => router.push("/databases/new"),
      },
      {
        id: "action-open-terminal",
        label: "Open Terminal",
        section: "Actions",
        hint: "Open server terminal session",
        icon: Terminal,
        onSelect: () => {
          const match = pathname.match(/^\/servers\/([^/]+)/);
          if (match?.[1]) {
            router.push(`/terminal?server=${match[1]}`);
            return;
          }
          router.push("/terminal");
        },
      },
      {
        id: "action-open-logs",
        label: "Open Runtime Logs",
        section: "Actions",
        hint: "Jump to the live log viewer",
        icon: Search,
        onSelect: () => contextAction("open-logs"),
      },
      {
        id: "action-deploy",
        label: "Deploy Current App",
        section: "Actions",
        hint: "Trigger a fresh deployment",
        icon: Workflow,
        onSelect: () => contextAction("deploy"),
      },
      {
        id: "action-stop",
        label: "Stop Current App",
        section: "Actions",
        hint: "Stop the active workload",
        icon: MonitorDot,
        onSelect: () => contextAction("stop"),
      },
      {
        id: "action-rollback",
        label: "Rollback Current App",
        section: "Actions",
        hint: "Rollback to the previous stable deployment",
        icon: RotateCcw,
        shortcut: "r",
        onSelect: () => contextAction("rollback"),
      },
      {
        id: "action-silence-alert",
        label: "Silence Current Alert",
        section: "Actions",
        hint: "Jump to alert detail and silence controls",
        icon: Bell,
        onSelect: () => contextAction("silence-alert"),
      },
      {
        id: "action-change-org",
        label: "Change Organization",
        section: "Actions",
        hint: user?.organizationName || "Open the team/org switcher",
        icon: Server,
        onSelect: () => router.push("/teams"),
      },
      {
        id: "nav-transparency",
        label: "Open Transparency",
        section: "Navigate",
        hint: "7-day uptime and SLA posture for your org",
        icon: Activity,
        onSelect: () => router.push("/transparency"),
      },
      {
        id: "action-toggle-theme",
        label: toggleThemeLabel,
        section: "Actions",
        hint: "Switch the dashboard color theme",
        icon: MoonStar,
        onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        id: "action-logout",
        label: "Log out",
        section: "Actions",
        hint: user?.email || "End the current session",
        icon: LogOut,
        onSelect: () => {
          void onLogout();
        },
      },
      ...servers.map((server: ServerRecord) => ({
        id: `server-${server.id}`,
        label: server.name,
        section: "Servers",
        hint: `${server.ip} · ${server.status}`,
        icon: Server,
        onSelect: () => router.push(`/servers/${server.id}`),
      })),
      ...apps.map((app) => ({
        id: `app-${app.id}`,
        label: app.name,
        section: "Apps",
        hint: `${app.server.name} · ${app.status}`,
        icon: Box,
        onSelect: () => router.push(`/apps/${app.id}`),
      })),
      ...databases.map((database) => ({
        id: `db-${database.id}`,
        label: database.name,
        section: "Databases",
        hint: `${database.serverName} · ${database.type}`,
        icon: Database,
        onSelect: () => router.push(`/databases/${database.id}`),
      })),
    ];
  }, [apps, databases, onLogout, pathname, resolvedTheme, router, servers, setTheme, user]);

  const recentActions = useMemo(() => {
    const lookup = new Map(actions.map((action) => [action.id, action]));
    return recentActionIds.map((id) => lookup.get(id)).filter(Boolean) as ActionEntry[];
  }, [actions, recentActionIds]);

  const groupedActions = useMemo(() => {
    return actions.reduce<Record<string, ActionEntry[]>>((acc, action) => {
      if (!acc[action.section]) {
        acc[action.section] = [];
      }
      acc[action.section].push(action);
      return acc;
    }, {});
  }, [actions]);

  const handleSelect = (entry: ActionEntry) => {
    persistRecentAction(entry.id);
    setRecentActionIds(readRecentActionIds());
    onOpenChange(false);
    entry.onSelect();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search navigation, commands, apps, databases..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {recentActions.length > 0 && (
          <CommandGroup heading="Recent">
            {recentActions.map((entry) => (
              <CommandItem key={entry.id} value={`${entry.label} ${entry.hint || ""}`} onSelect={() => handleSelect(entry)}>
                <entry.icon className="text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{entry.label}</span>
                  {entry.hint ? <span className="text-muted-foreground truncate text-xs">{entry.hint}</span> : null}
                </div>
                {entry.shortcut ? <CommandShortcut>{entry.shortcut}</CommandShortcut> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {recentActions.length > 0 ? <CommandSeparator /> : null}
        {Object.entries(groupedActions).map(([section, entries]) => (
          <CommandGroup key={section} heading={section}>
            {entries.map((entry) => (
              <CommandItem
                key={entry.id}
                value={`${entry.label} ${entry.hint || ""} ${section}`}
                onSelect={() => handleSelect(entry)}
                className={cn(pathname === entry.id ? "bg-accent" : undefined)}
              >
                <entry.icon className="text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{entry.label}</span>
                  {entry.hint ? <span className="text-muted-foreground truncate text-xs">{entry.hint}</span> : null}
                </div>
                {entry.shortcut ? <CommandShortcut>{entry.shortcut}</CommandShortcut> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
