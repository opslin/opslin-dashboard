import { Laptop, Link2, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AgentInstallCommandsProps = {
  apiUrl: string;
  dashboardUrl: string;
  className?: string;
  compact?: boolean;
  showEndpoints?: boolean;
};

export function AgentInstallCommands({
  apiUrl,
  dashboardUrl,
  className,
  compact = false,
  showEndpoints = true,
}: AgentInstallCommandsProps) {
  const linuxCommand = `curl -fsSL ${apiUrl}/agent/install | sudo bash`;
  const macCommand = `curl -fsSL ${apiUrl}/agent/install/macos | bash`;

  return (
    <div className={cn("space-y-4", className)}>
      <div className={cn("grid gap-3", compact ? "lg:grid-cols-2" : "md:grid-cols-2")}>
        <InstallCommand
          icon={Server}
          label="Linux VPS"
          detail="Ubuntu, Debian, Fedora, Alpine, Arch"
          badge="Server"
          command={linuxCommand}
        />
        <InstallCommand
          icon={Laptop}
          label="MacBook"
          detail="Local testing with Docker Desktop"
          badge="Local"
          command={macCommand}
        />
      </div>

      {showEndpoints ? (
        <div className="grid gap-3 rounded-2xl border border-border/70 bg-secondary/25 p-4 text-sm md:grid-cols-2">
          <Endpoint label="Dashboard URL" value={dashboardUrl} />
          <Endpoint label="API URL" value={apiUrl} />
        </div>
      ) : null}
    </div>
  );
}

function InstallCommand({
  icon: Icon,
  label,
  detail,
  badge,
  command,
}: {
  icon: typeof Server;
  label: string;
  detail: string;
  badge: string;
  command: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-secondary/50">
            <Icon className="size-5 text-primary" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">{badge}</Badge>
      </div>
      <code tabIndex={0} className="mt-4 block overflow-x-auto rounded-xl border border-border/70 bg-secondary/35 px-3 py-3 font-mono text-xs text-foreground">
        {command}
      </code>
    </div>
  );
}

function Endpoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        <Link2 className="size-3.5" />
        {label}
      </p>
      <code tabIndex={0} className="mt-2 block overflow-x-auto rounded-xl bg-background px-3 py-2 font-mono text-xs text-foreground">
        {value}
      </code>
    </div>
  );
}
