import {
  Activity,
  Archive,
  Bell,
  Box,
  Database,
  FileText,
  Rocket,
  Server,
  Shield,
  Terminal,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ActivityIconName =
  | "activity"
  | "archive"
  | "bell"
  | "box"
  | "database"
  | "file-text"
  | "rocket"
  | "server"
  | "shield"
  | "terminal"
  | "user"
  | "users";

export const activityIconMap: Record<ActivityIconName, LucideIcon> = {
  activity: Activity,
  archive: Archive,
  bell: Bell,
  box: Box,
  database: Database,
  "file-text": FileText,
  rocket: Rocket,
  server: Server,
  shield: Shield,
  terminal: Terminal,
  user: User,
  users: Users,
};

export function activityIconForEvent(event: string): ActivityIconName {
  if (event.startsWith("deploy.")) return "rocket";
  if (event.startsWith("app.")) return "box";
  if (event.startsWith("server.")) return "server";
  if (event.startsWith("org.")) return "users";
  if (event.startsWith("auth.")) return "user";
  if (event.startsWith("database.")) return "database";
  if (event.startsWith("backup.")) return "archive";
  if (event.startsWith("firewall.")) return "shield";
  if (event.startsWith("alert.")) return "bell";
  if (event.startsWith("terminal.")) return "terminal";
  if (event.startsWith("audit.")) return "file-text";
  return "activity";
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function formatActivityDescription(input: {
  event: string;
  targetType?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const metadata = input.metadata || {};
  const target =
    text(metadata.appName) ||
    text(metadata.serverName) ||
    text(metadata.name) ||
    text(metadata.email) ||
    input.targetType ||
    "resource";

  switch (input.event) {
    case "deploy.started":
    case "app.deploy":
      return `Deployment started for ${target}`;
    case "deploy.succeeded":
      return `Deployment completed for ${target}`;
    case "deploy.failed":
      return `Deployment failed for ${target}`;
    case "app.create":
      return `Application ${target} was created`;
    case "app.start":
      return `Application ${target} was started`;
    case "app.stop":
      return `Application ${target} was stopped`;
    case "server.claim":
      return `Server ${target} was claimed`;
    case "org.invite_sent":
      return `Invitation sent to ${target}`;
    case "auth.login":
      return "User signed in";
    default:
      return input.event.replace(/[._-]/g, " ");
  }
}
