import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ChevronRight, Network, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AttentionItem {
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel: string;
    href?: string;
    onAction?: () => void;
}

export const attentionIcons = { shield: ShieldAlert, ports: Network, update: RefreshCw, offline: WifiOff };

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
    if (items.length === 0) return null;
    return (
        <section aria-labelledby="needs-attention" className="rounded-2xl border border-warning/25 bg-warning-muted/40 p-4">
            <div className="mb-3 flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-full bg-warning/15 text-warning-text">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                </span>
                <h2 id="needs-attention" className="text-base font-semibold text-foreground">Needs attention</h2>
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning-text">{items.length}</span>
            </div>
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border bg-card">
                {items.map((item) => (
                    <li key={item.id} className="flex items-center gap-4 p-3.5">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning-text">
                            <item.icon className="size-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground">{item.title}</p>
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                        {item.href ? (
                            <Button asChild variant="outline" size="sm">
                                <Link href={item.href}>{item.actionLabel}<ChevronRight aria-hidden="true" /></Link>
                            </Button>
                        ) : (
                            <Button variant="outline" size="sm" onClick={item.onAction}>{item.actionLabel}<ChevronRight aria-hidden="true" /></Button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
