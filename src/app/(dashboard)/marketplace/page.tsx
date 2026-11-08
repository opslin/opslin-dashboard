"use client";

import Image from "next/image";
import { Lock } from "lucide-react";
import { MarketplaceCatalog } from "@/components/marketplace/marketplace-catalog";
import { Card } from "@/components/ui/card";

// Real logos of the kind of software Marketplace will deploy. Faded on purpose: they are a preview, not a catalog.
const PREVIEW = ["n8n", "chatwoot", "metabase", "umami", "uptime-kuma", "twenty", "open-webui", "searxng"] as const;

/**
 * Marketplace is "coming soon" for everyone (founder decision, 2026-11-08). The catalog itself is unchanged and stays in
 * the code; set NEXT_PUBLIC_MARKETPLACE_PREVIEW=1 to see it while developing. The API still enforces its own
 * `marketplace.enabled` flag either way.
 */
export default function MarketplacePage() {
    if (process.env.NEXT_PUBLIC_MARKETPLACE_PREVIEW === "1") {
        return <MarketplaceCatalog />;
    }
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-10 sm:py-16">
            <Card className="items-center gap-0 overflow-hidden py-0 text-center">
                <div className="flex w-full items-center justify-center gap-3 border-b border-border/70 bg-muted/40 px-6 py-8" aria-hidden="true">
                    {PREVIEW.map((name, index) => (
                        <span
                            key={name}
                            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card shadow-sm max-sm:[&:nth-child(n+5)]:hidden"
                            style={{ opacity: 0.35 + (index % 3) * 0.1 }}
                        >
                            <Image src={`/brands/${name}.svg`} alt="" width={28} height={28} unoptimized className="size-7 object-contain grayscale" />
                        </span>
                    ))}
                </div>
                <div className="flex flex-col items-center gap-3 px-6 py-10">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <Lock className="size-5" aria-hidden="true" />
                    </span>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Marketplace</h1>
                    <p className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">Coming soon</p>
                </div>
            </Card>
        </div>
    );
}
