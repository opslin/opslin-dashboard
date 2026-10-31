import Image from "next/image";
import { cn } from "@/lib/utils";
import type { MarketplaceEntry } from "@/lib/api";

/** The publisher's logo on a quiet tile; a letter tile when no logo file is added yet. */
export function BrandTile({ entry, className }: { entry: Pick<MarketplaceEntry, "name" | "logo">; className?: string }) {
    return (
        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary", className)} aria-hidden="true">
            {entry.logo ? (
                <Image src={`/brands/${entry.logo}`} alt="" width={28} height={28} className="size-7 object-contain" unoptimized />
            ) : (
                <span className="text-base font-semibold text-muted-foreground">{entry.name.slice(0, 1).toUpperCase()}</span>
            )}
        </span>
    );
}
