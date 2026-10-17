"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export const BRAND_NAMES: Record<string, string> = { postgresql: "PostgreSQL", mysql: "MySQL", mariadb: "MariaDB", mongodb: "MongoDB", redis: "Redis", docker: "Docker", nginx: "nginx" };

/** A real brand logo for a service the owner recognizes. Renders nothing for a name without a logo. */
export function Brand({ name, className }: { name: string; className?: string }) {
    if (!BRAND_NAMES[name]) return null;
    return <Image src={`/brands/${name}.svg`} alt={BRAND_NAMES[name]!} title={BRAND_NAMES[name]} width={28} height={28} unoptimized className={cn("h-7 w-7 object-contain", className)} />;
}
