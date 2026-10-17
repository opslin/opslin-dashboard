import type { ServerProvider } from "@/lib/api";

/** The hosting company a server is with, found automatically by Opslin (agent + address owner). Shows nothing when unknown. */
export function ProviderBadge({ provider }: { provider?: ServerProvider | null }) {
    if (!provider) return null;
    return (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground" title={`Hosted on ${provider.name}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/brands/providers/${provider.id}.svg`} alt="" className="size-3.5" />
            {provider.name}
        </span>
    );
}
