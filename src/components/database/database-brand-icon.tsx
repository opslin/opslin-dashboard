import { cn } from "@/lib/utils";

type DatabaseEngine = "postgresql" | "mysql" | "mongodb" | "redis";

const ICON_URLS: Record<DatabaseEngine, string> = {
  postgresql: "/brands/postgresql.svg",
  mysql: "/brands/mysql.svg",
  mongodb: "/brands/mongodb.svg",
  redis: "/brands/redis.svg",
};

const LABELS: Record<DatabaseEngine, string> = {
  postgresql: "PostgreSQL logo",
  mysql: "MySQL logo",
  mongodb: "MongoDB logo",
  redis: "Redis logo",
};

export function normalizeDatabaseEngine(value: string): DatabaseEngine {
  const normalized = value.toLowerCase();
  if (normalized === "postgresql" || normalized === "mysql" || normalized === "mongodb" || normalized === "redis") {
    return normalized;
  }
  return "postgresql";
}

export function DatabaseBrandIcon({
  engine,
  size = 48,
  className,
}: {
  engine: string;
  size?: number;
  className?: string;
}) {
  const normalizedEngine = normalizeDatabaseEngine(engine);

  return (
    <span
      className={cn("database-brand-icon shrink-0", `database-brand-icon-${normalizedEngine}`, className)}
      style={{ width: size + 16, height: size + 16 }}
    >
      {/* Local brand artwork keeps the dashboard reliable when external image hosts are unavailable. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ICON_URLS[normalizedEngine]}
        alt={LABELS[normalizedEngine]}
        width={size}
        height={size}
        loading="lazy"
      />
    </span>
  );
}
